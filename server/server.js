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
app.post("/create-user", async (req, res) => {
  try {
    const newUser = new User({
      xp: 0,
      seviye: 1,
      görevler: [
        {
          title: "Şınav",
          progress: 0,
          total: 10,
        },
        {
          title: "Kitap oku",
          progress: 0,
          total: 20,
        },
      ],
    });

    await newUser.save();

    // ✅ FRONTEND’E UYUMLU FORMAT
    res.json({
      _id: newUser._id,
      xp: newUser.xp,
      level: newUser.seviye,
      tasks: newUser.görevler,
    });

  } catch (err) {
    res.status(500).json({ error: "User oluşturulamadı" });
  }
});

/* 📋 TASKS */
app.get("/tasks", async (req, res) => {
  try {
    const user = await User.findOne();
    res.json(
  (user?.görevler || []).map((t) => ({
    _id: t._id,
    title: t.title,
    progress: t.progress || t.ilerleme || 0,
    total: t.total || 10,
  }))
);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/create-user", async (req, res) => {
  try {
    const newUser = new User({
      xp: 0,
      seviye: 1,
      görevler: [
        {
          title: "Şınav",
          progress: 0,
          total: 10,
        },
        {
          title: "Kitap oku",
          progress: 0,
          total: 20,
        },
      ],
    });

    await newUser.save();

    res.json({
      _id: newUser._id,
      xp: newUser.xp,
      level: newUser.seviye,
      tasks: newUser.görevler,
    });

  } catch (err) {
    res.status(500).json({ error: "User oluşturulamadı" });
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
/* 📈 TASK PROGRESS */
app.post("/progress-task", async (req, res) => {
  try {
    const { title, amount } = req.body;

    let user = await User.findOne();

    if (!user) {
      return res.status(404).json({ error: "User yok" });
    }

    const task = user.tasks.find(t => t.title === title);

    if (!task) {
      return res.status(404).json({ error: "Task yok" });
    }

    if (task.completed) {
      return res.json({ message: "Zaten tamamlandı" });
    }

    task.progress += amount;

    let leveledUp = false;

    if (task.progress >= 100) {
      task.completed = true;
      task.progress = 100;

      // XP ver
      user.xp += 50;

      const neededXP = user.level * 100;

      if (user.xp >= neededXP) {
        user.level += 1;
        user.xp = 0;
        leveledUp = true;
      }
    }

    await user.save();

    res.json({
      tasks: user.tasks,
      xp: user.xp,
      level: user.level,
      leveledUp
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server çalıştı 🚀");
});