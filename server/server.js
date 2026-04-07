const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

/* 🔥 MongoDB bağlantı */
if (!process.env.MONGO_URI) {
  console.log("❌ MONGO_URI TANIMLI DEĞİL!");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB bağlandı 🚀");
  })
  .catch((err) => {
    console.log("MongoDB hata:", err);
    process.exit(1);
  });

/* 👤 USER SCHEMA */
const userSchema = new mongoose.Schema({
  username: String,

  xp: {
    type: Number,
    default: 0,
  },

  level: {
    type: Number,
    default: 1,
  },

  tasks: [
    {
      title: String,
      completed: Boolean,
      progress: {
        type: Number,
        default: 0,
      },
    },
  ],

  lastDailyReset: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model("User", userSchema);

/* 🚀 TEST */
app.get("/", (req, res) => {
  res.send("API çalışıyor 🚀");
});

/* 👤 USER */
app.get("/create-user", async (req, res) => {
  try {
    let user = await User.findOne();

    if (!user) {
      user = await User.create({
        username: "Yusuf",
        xp: 0,
        level: 1,
        tasks: [
          { title: "Spor yap", completed: false },
          { title: "Kitap oku", completed: false },
        ],
      });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 📋 TASKS */
app.get("/tasks", async (req, res) => {
  try {
    const user = await User.findOne();
    res.json(user?.tasks || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 🔥 XP */
app.post("/add-xp", async (req, res) => {
  try {
    const { xp } = req.body;

    let user = await User.findOne();

    user.xp += xp;

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
      leveledUp,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 🚀 SERVER */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server çalıştı 🚀");
});