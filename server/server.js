const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

/* 🔥 MongoDB */
if (!process.env.MONGO_URI) {
  console.log("❌ MONGO_URI YOK");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB bağlandı 🚀"))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });

/* 👤 SCHEMA */
const userSchema = new mongoose.Schema({
  username: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },

  streak: { type: Number, default: 0 },
  lastActiveDate: { type: Date, default: null },

  tasks: [
    {
      title: String,
      progress: { type: Number, default: 0 },
      total: { type: Number, default: 10 },
      completed: { type: Boolean, default: false },
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

/* 🧹 RESET */
app.get("/reset", async (req, res) => {
  await User.deleteMany({});
  res.send("Database temizlendi 🧹");
});

/* 👤 CREATE USER */
app.get("/create-user", async (req, res) => {
  try {
    const existing = await User.findOne();
    if (existing) return res.json(existing);

    const newUser = new User({
      username: "Yusuf",
      tasks: [
        { title: "Spor yap" },
        { title: "Kitap oku" },
      ],
    });

    await newUser.save();
    res.json(newUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 📋 TASKS */
app.get("/tasks", async (req, res) => {
  try {
    const user = await User.findOne().sort({ _id: -1 });

    if (!user) {
      return res.json([]); // boş dön ama hata verme
    }

    res.json(user.tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 📈 TASK PROGRESS */
app.post("/progress-task", async (req, res) => {
  try {
    const { userId, taskId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User yok" });

    const task = user.tasks.find(
      (t) => t._id.toString() === taskId
    );

    if (!task) {
      return res.status(404).json({ error: "Task yok" });
    }

    if (task.completed) {
      return res.json({ message: "Zaten tamamlandı" });
    }

    task.progress += 1;

    let leveledUp = false;

    if (task.progress >= task.total) {
      task.progress = task.total;
      task.completed = true;

      user.xp += 50;

      const neededXP = user.level * 100;

      if (user.xp >= neededXP) {
        user.level += 1;
        user.xp = 0;
        leveledUp = true;
      }
    }

    // 🔥 STREAK
    const today = new Date();
    const lastDate = user.lastActiveDate
      ? new Date(user.lastActiveDate)
      : null;

    const diffDays = lastDate
      ? Math.floor((today - lastDate) / (1000 * 60 * 60 * 24))
      : null;

    if (!lastDate) {
      user.streak = 1;
    } else if (diffDays === 1) {
      user.streak += 1;
    } else if (diffDays > 1) {
      user.streak = 1;
    }

    user.lastActiveDate = today;

    await user.save();

    res.json({
      player: user,
      task,
      leveledUp,
      streak: user.streak,
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