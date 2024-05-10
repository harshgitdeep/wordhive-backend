const express = require('express');
const cors = require('cors');
const mongoose = require("mongoose");
const User = require('./models/User');
const Post = require('./models/Post');
const bcrypt = require('bcrypt');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
const nodemailer = require("nodemailer");
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
// import {v2 as cloudinary} from 'cloudinary';

const salt = bcrypt.genSaltSync(10);
const secret = 'asdfe45we45w345wegw345werjktjwertkj';

app.use(cors({credentials:true,origin:'http://localhost:3000'}));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: 'dsuy0nbr7', 
  api_key: '655729588491148', 
  api_secret: 'ZUp19g_3J6eLo7WqA1jPEXNQaf4' 
});

mongoose.connect('mongodb+srv://WordHive:aa69bb@cluster0.cfvft9t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');

async function sendVerificationMail(email_to) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: false,
    auth: {
      user: "wordhiveblogs@gmail.com",
      pass: "sxvtawnkhfzpminy ",
    },
  });
  const info = await transporter.sendMail({
    to: email_to,
    from: "wordhiveblogs@gmail.com",
    subject: "Thank You for Registering !",
    html: `
    <p>Welcome to <strong>Word Hive Blogs</strong>!</p>
    <p>Discover and share your thoughts with us.</p>
    <p>Explore topics and articles on our website.</p>
    <p>Have questions? Email us at wordhiveblogs@gmail.com.</p>
    <div style="text-align:center;">
      <a href="https://wordhive.vercel.app/"><img src="https://i.ibb.co/8mSX6F0/loading.gif" alt="loading" style="width:200px;height:auto;display:block;margin:0 auto;"></a>
    </div>
    <p>We're excited to see your blogs!</p>
    <p><strong>Best regards,</strong><br><strong>Team Word Hive Blog</strong></p>
  `,
  });
}

app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
      email,
    });
    await sendVerificationMail(email);
    res.json(userDoc);
  } catch (e) {
    console.log(e);
    res.status(400).json(e);
  }
});


app.get('/check-username/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const user = await User.findOne({ username });
    res.json({ available: !user });
  } catch (error) {
    console.error('Error checking username availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/login', async (req,res) => {
  const {username,password} = req.body;
  const userDoc = await User.findOne({username});
  if (!userDoc) {
    res.status(400).json('Wrong username or password!');
    return;
  }
  
  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    // logged in
    jwt.sign({username,id:userDoc._id}, secret, {}, (err,token) => {
      if (err) throw err;
      res.cookie('token', token).json({
        id:userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json('Wrong username or password');
  }
});


app.get('/profile', (req,res) => {
  const {token} = req.cookies;
  jwt.verify(token, secret, {}, (err,info) => {
    if (err) throw err;
    res.json(info);
  });
});

app.post('/logout', (req,res) => {
  res.cookie('token', '').json('ok');
});

app.post('/post', uploadMiddleware.single('file'), async (req,res) => {
  const {originalname, path} = req.file;
  const parts = originalname.split('.');
  const ext = parts[parts.length - 1];
  const newPath = path + '.' + ext;
  fs.renameSync(path, newPath);

  // Upload image to Cloudinary
  const result = await cloudinary.uploader.upload(newPath, { folder: 'wordhive-uploads' });

  const {token} = req.cookies;
  jwt.verify(token, secret, {}, async (err,info) => {
    if (err) throw err;
    const {title, summary, content} = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: result.secure_url, // Use the secure_url provided by Cloudinary
      author: info.id,
    });
    res.json(postDoc);
  });

});

app.post('/register', async (req,res) => {
  const {username,password,email} = req.body;
  try {
    // Check if username is already taken
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Check if email is already registered
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user
    const salt = bcrypt.genSaltSync(10);
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password,salt),
      email,
    });
    await sendVerificationMail(email);
    res.json(userDoc);
  } catch(e) {
    console.log(e);
    res.status(400).json(e);
  }
});


app.get('/post', async (req,res) => {
  res.json(
    await Post.find()
      .populate('author', ['username'])
      .sort({createdAt: -1})
      .limit(20)
  );
});

app.get('/post/:id', async (req, res) => {
  const {id} = req.params;
  const postDoc = await Post.findById(id).populate('author', ['username']);
  res.json(postDoc);
})
app.delete('/post/:id', async (req, res) => {
  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { id } = req.params;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json('You are not the author');
    }
    await Post.findByIdAndDelete(id);
    res.json('Post deleted successfully');
  });
});

app.listen(4000,() =>{
  console.log("Server is running!")
});
