const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const nodemailer = require("nodemailer");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;

const User = require("./models/User");
const Post = require("./models/Post");

const app = express();
const salt = bcrypt.genSaltSync(10);
const secret = "asdfe45we45w345wegw345werjktjwertkj";
const uploadMiddleware = multer({ dest: "uploads/" });

app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));

//-------------------------------------------------------
// Cloudinary Configuration
//-------------------------------------------------------

cloudinary.config({
  cloud_name: "dsuy0nbr7",
  api_key: "655729588491148",
  api_secret: "ZUp19g_3J6eLo7WqA1jPEXNQaf4",
});

//-------------------------------------------------------
// MongoDB Connection
//-------------------------------------------------------

mongoose
  .connect(
    "mongodb+srv://WordHive:aa69bb@cluster0.cfvft9t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err.message);
  });

//-------------------------------------------------------
// Nodemailer Configuration
//-------------------------------------------------------

async function sendVerificationMail(email_to) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: "wordhiveblogs@gmail.com",
      pass: "sxvtawnkhfzpminy",
    },
  });

  await transporter.sendMail({
    to: email_to,
    from: "wordhiveblogs@gmail.com",
    subject: "Thank You for Registering!",
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

//-------------------------------------------------------
// User Registration and Authentication
//-------------------------------------------------------

app.post("/register", async (req, res) => {
  const { username, password, email } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ error: "Username already taken" });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ error: "Email already registered" });
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

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const userDoc = await User.findOne({ username });
  if (!userDoc) {
    res.status(400).json("Wrong username or password!");
    return;
  }

  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
      if (err) throw err;
      res.cookie("token", token).json({
        id: userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json("Wrong username or password");
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) throw err;
    res.json(info);
  });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

//-------------------------------------------------------
// Check Username and Email Availability
//-------------------------------------------------------

app.get("/check-username/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const user = await User.findOne({ username });
    res.json({ available: !user });
  } catch (error) {
    console.error("Error checking username availability:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/check-email/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const user = await User.findOne({ email });
    res.json({ available: !user });
  } catch (error) {
    console.error("Error checking email availability:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//-------------------------------------------------------
// Blog Post Management
//-------------------------------------------------------

app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  const { token } = req.cookies;
  try {
    const decoded = jwt.verify(token, secret);
    const { title, summary, content } = req.body;

    let coverUrl;
    if (req.file) {
      const { path } = req.file;
      const result = await cloudinary.uploader.upload(path, {
        folder: "wordhive-uploads",
      });
      coverUrl = result.secure_url;
      fs.unlinkSync(path);
    }

    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: coverUrl,
      author: decoded.id,
    });

    res.json(postDoc);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/post/:id", uploadMiddleware.single("file"), async (req, res) => {
  const { token } = req.cookies;
  try {
    const decoded = jwt.verify(token, secret);
    const { title, summary, content } = req.body;

    const postDoc = await Post.findById(req.params.id);
    if (!postDoc) return res.status(404).json("Post not found");

    const isAuthor = postDoc.author.equals(decoded.id);
    if (!isAuthor) return res.status(403).json("You are not the author");

    if (req.file) {
      const { path } = req.file;
      const result = await cloudinary.uploader.upload(path, {
        folder: "wordhive-uploads",
      });
      postDoc.cover = result.secure_url;
      fs.unlinkSync(path);
    }

    postDoc.title = title;
    postDoc.summary = summary;
    postDoc.content = content;

    await postDoc.save();

    res.json(postDoc);
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/post", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(posts);
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});

app.delete("/post/:id", async (req, res) => {
  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { id } = req.params;
    try {
      const postDoc = await Post.findById(id);
      const isAuthor =
        JSON.stringify(postDoc.author) === JSON.stringify(info.id);
      if (!isAuthor) {
        return res.status(400).json("You are not the author");
      }
      await Post.findByIdAndDelete(id);
      res.json("Post deleted successfully");
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
});




//-------------------------------------------------------
// Start Server
//-------------------------------------------------------

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

