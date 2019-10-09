//importação das dependencias utilizadas
const express  = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const app = express();

//tanto http quando websocket
//const server = require('http').Server(app);
//const io = require('socket.io')(server);

//Realiza a conexão com o banco de dados
mongoose.connect('mongodb+srv://marco:marco@cluster0-h4nsl.mongodb.net/test?retryWrites=true&w=majority', {
	useNewUrlParser: true,
});

// app.use((req, res, next) => {
// 	req.io = io;
//	next();
// });

//permite que qualquer aplicação acesse o backend. Talvez mais a frente seja necessario restringir somente para celular.
app.use(cors());
//rotas para acessar arquivos estaticos como as imagens
app.use('/files', express.static(path.resolve(__dirname, '..', 'uploads', 'resized')));
//arquivo com as rotas da aplicação
app.use(require('./routes'));

app.listen(3333);
//server.listen(3333);
