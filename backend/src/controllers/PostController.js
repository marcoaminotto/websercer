const Post = require('../models/Post');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

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
        
        //Redimenciona a imagem recebida e salva na pasta resided em upload
        await sharp(req.file.path)
            .resize(500)
            .jpeg({ quality: 70 })
            .toFile(
                path.resolve(req.file.destination, 'resized', fileName)
            )
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