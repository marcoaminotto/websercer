const express = require('express');
const multer = require('multer');
const uploadConfig = require('./config/upload');
const PostController = require('./controllers/PostController');

const routes = new express.Router();
//o multer permite que o express entenda os arquivos recebidos no formato Multipart Form(ou seja a imagem)
const upload = multer(uploadConfig);
//rotas
routes.get('/posts',PostController.index);
routes.post('/posts', upload.single('image'),PostController.store);

module.exports = routes;