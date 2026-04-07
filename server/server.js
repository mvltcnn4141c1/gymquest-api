const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 MongoDB (Render için)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB bağlandı"))
  .catch(err => console.log(err));

// 👤 User Schema
const userSchema = new mongoose.Schema({
  username: String,

  xp: {
    type: Number,
    default: 0
  },

  level: {
    type: Number,
    default: 1
  },

  tasks: [
    {
      title: String,
      completed: Boolean,
      progress: Number
    }
  ],

  lastDailyReset: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model("User", userSchema);

// 🚀 TEST ROUTE
app.get("/", (req, res) => {
  res.send("API ÇALIŞIYOR 🔥");
});

// 👤 USER CREATE
app.get("/create-user", async (req, res) => {
  let user = await User.findOne();

  if (!user) {
    user = await User.create({
      username: "Yusuf",
      xp: 0,
      level: 1,
      tasks: [
        { title: "Spor yap", completed: false },
        { title: "Kitap oku", completed: false }
      ]
    });
  }

  res.json(user);
});

// 📋 TASKS
app.get("/tasks", async (req, res) => {
  const user = await User.findOne();
  res.json(user?.tasks || []);
});

// 🔥 XP EKLE
app.post("/add-xp", async (req, res) => {
  const { xp } = req.body;

  let user = await User.findOne();

  if (!user) return res.status(404).json({ error: "User yok" });

  user.xp += xp;

  // LEVEL SİSTEMİ
  const neededXP = user.level * 100;

  let leveledUp = false;

  if (user.xp >= neededXP) {
    user.level += 1;
    user.xp = 0;
    leveledUp = true;
  }

  await user.save();

  res.json({
    xp: user.xp,
    level: user.level,
    leveledUp
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server çalıştı 🚀"));