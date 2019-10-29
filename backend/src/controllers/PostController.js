const Post = require('../models/Post');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const cv = require('opencv4nodejs');
 

module.exports = {
    async index(req, res) {
        //Ao buscar, ele irá ordenar em ordem decrescente referente a data de criação, ou seja os mais recentes primeiros 
        const posts = await Post.find().sort('-createdAt');

        return res.json(posts);
    }, 
    //Para cadastrar novas fotos no banco de dados
    async store(req, res) {
        const { sign } = req.body;
        const { filename: image } = req.file;

        const [name] = image.split('.');
        const fileName = `${name}.jpg`;

        ////const mask = await cv.makeHandMask(req.file.path);
        //req.file = cv(req.file); 

//------------------------PROCESSAMENTO DE IMAGEM-------------------------//        
        const skinColorUpper = hue => new cv.Vec(hue, 0.8 * 255, 0.6 * 255);
        const skinColorLower = hue => new cv.Vec(hue, 0.1 * 255, 0.05 * 255);

        const mat = cv.imread(req.file.path);
        const imgHLS = mat.cvtColor(cv.COLOR_BGR2HLS);
        //cv.imwrite(req.file.path, imgHLS);
         const rangeMask = imgHLS.inRange(skinColorLower(0), skinColorUpper(15));
        //cv.imwrite(req.file.path, rangeMask);

        // remove noise
        const blurred = rangeMask.blur(new cv.Size(10, 10));
        //cv.imwrite(req.file.path, blurred);
        const thresholded = blurred.threshold(
          200,
          255,
          cv.THRESH_BINARY
        );

        

        //gera o contorno da mão
        const getHandContour = (handMask) => {
            const contours = thresholded.findContours(
              cv.RETR_EXTERNAL,
              cv.CHAIN_APPROX_SIMPLE
            );
            // largest contour
            return contours.sort((c0, c1) => c1.area - c0.area)[0];
            
            //Retorna tipo isso
            // Contour {
            //     hierarchy: Vec4 { z: -1, y: -1, x: 97, w: 99 },
            //     numPoints: 1546,
            //     area: 193361,
            //     isConvex: false }
            // }
        };
        

        // returns distance of two points
        const ptDist = (pt1, pt2) => pt1.sub(pt2).norm();

        // returns center of all points
        const getCenterPt = pts => pts.reduce(
            (sum, pt) => sum.add(pt),
            new cv.Point(0, 0)
            ).div(pts.length);

        // get the polygon from a contours hull such that there
        // will be only a single hull point for a local neighborhood
        const getRoughHull = (contour, maxDist) => {
            // get hull indices and hull points
            const hullIndices = contour.convexHullIndices();
            const contourPoints = contour.getPoints();
            const hullPointsWithIdx = hullIndices.map(idx => ({
                 pt: contourPoints[idx],
                 contourIdx: idx
             }));
            const hullPoints = hullPointsWithIdx.map(ptWithIdx => ptWithIdx.pt);
            
            // // group all points in local neighborhood
            const ptsBelongToSameCluster = (pt1, pt2) => ptDist(pt1, pt2) < maxDist;
            const { labels } = cv.partition(hullPoints, ptsBelongToSameCluster);
            const pointsByLabel = new Map();
            labels.forEach(l => pointsByLabel.set(l, []));
            hullPointsWithIdx.forEach((ptWithIdx, i) => {
                const label = labels[i];
                pointsByLabel.get(label).push(ptWithIdx);
            });
  
            // map points in local neighborhood to most central point
            const getMostCentralPoint = (pointGroup) => {
                // find center
                const center = getCenterPt(pointGroup.map(ptWithIdx => ptWithIdx.pt));
                // sort ascending by distance to center
                return pointGroup.sort(
                    (ptWithIdx1, ptWithIdx2) => ptDist(ptWithIdx1.pt, center) - ptDist(ptWithIdx2.pt, center)
                    )[0];
            };
            const pointGroups = Array.from(pointsByLabel.values());
            // return contour indices of most central points
            return pointGroups.map(getMostCentralPoint).map(ptWithIdx => ptWithIdx.contourIdx);
        };

        const getHullDefectVertices = (handContour, hullIndices) => {
            const defects = handContour.convexityDefects(hullIndices);
            const handContourPoints = handContour.getPoints();

            // get neighbor defect points of each hull point
            const hullPointDefectNeighbors = new Map(hullIndices.map(idx => [idx, []]));
            defects.forEach((defect) => {
                const startPointIdx = defect.at(0);
                const endPointIdx = defect.at(1);
                const defectPointIdx = defect.at(2);
                hullPointDefectNeighbors.get(startPointIdx).push(defectPointIdx);
                hullPointDefectNeighbors.get(endPointIdx).push(defectPointIdx);
            });

            return Array.from(hullPointDefectNeighbors.keys())
                // only consider hull points that have 2 neighbor defects
               .filter(hullIndex => hullPointDefectNeighbors.get(hullIndex).length > 1)
                // return vertex points
               .map((hullIndex) => {
                    const defectNeighborsIdx = hullPointDefectNeighbors.get(hullIndex);
                    return ({
                        pt: handContourPoints[hullIndex],
                        d1: handContourPoints[defectNeighborsIdx[0]],
                        d2: handContourPoints[defectNeighborsIdx[1]]
                    });
                });
        };

        const filterVerticesByAngle = (vertices, maxAngleDeg) =>
            vertices.filter((v) => {
                const sq = x => x * x;
                const a = v.d1.sub(v.d2).norm();
                const b = v.pt.sub(v.d1).norm();
                const c = v.pt.sub(v.d2).norm();
                const angleDeg = Math.acos(((sq(b) + sq(c)) - sq(a)) / (2 * b * c)) * (180 / Math.PI);
                return angleDeg < maxAngleDeg;
            });

        //main

        const blue = new cv.Vec(255, 0, 0);
        const green = new cv.Vec(0, 255, 0);
        const red = new cv.Vec(0, 0, 255);

        const maxPointDist = 25;
        const handContour = getHandContour(thresholded);
        const edgePoints = handContour.getPoints();
        const hullIndices = getRoughHull(handContour, maxPointDist);
        const vertices = getHullDefectVertices(handContour, hullIndices);
        
        // fingertip points are those which have a sharp angle to its defect points
        const maxAngleDeg = 100;
        const verticesWithValidAngle = filterVerticesByAngle(vertices, maxAngleDeg);
        console.log(verticesWithValidAngle);
        
        const result = mat.copy();
        verticesWithValidAngle.forEach((v) => {
            mat.drawLine(
                v.pt,
                v.d1,
                { color: green, thickness: 2 }
            );
            mat.drawLine(
                v.pt,
                v.d2,
                { color: green, thickness: 2 }
            );
            mat.drawEllipse(
                new cv.RotatedRect(v.pt, new cv.Size(20, 20), 0),
                    { color: red, thickness: 2 }
                );
            result.drawEllipse(
                new cv.RotatedRect(v.pt, new cv.Size(20, 20), 0),
                    { color: red, thickness: 2 }
                );
        });
        //cv.imwrite(req.file.path, mat);
        
        ////Faz o desenho do contorno da mão
        mat.drawContours(
            [edgePoints],
            0,
            green,
            { thickness: 2 }
        );
        
        cv.imwrite(req.file.path, mat); 
        
        
        
//-----------------------TERMINO DO PROCESSAMENTO DE IMAGEM----------------------------//

        // //Redimenciona a imagem recebida e salva na pasta resided em upload
        await sharp(req.file.path) //req.file.path
            .resize(500)
            .jpeg({ quality: 70 })
            .toFile(
                path.resolve(req.file.destination, 'resized', fileName)
            )
    
        console.log(req.file.destination);
        
        //deleta a imagem do uploads, e assim deixando somente a imagem redimencionada salva
        fs.unlinkSync(req.file.path);
        
        //salva no banco de dados
        const post = await Post.create({
            sign,
            image: fileName,
        });

        //envia uma mensagem aos usuarios através de websocket
        //req.io.emit('post', post);
        
        return res.json(post);
    }
};