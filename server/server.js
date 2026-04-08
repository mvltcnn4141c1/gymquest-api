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

  // 🔥 STREAK
  streak: {
    type: Number,
    default: 0,
  },
  lastActiveDate: {
    type: Date,
    default: null,
  },

  // ✅ DOĞRU TASK SCHEMA
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
    const newUser = new User({
      username: "Yusuf",
      tasks: [
        {
          title: "Spor yap",
          progress: 0,
          total: 10,
          completed: false,
        },
        {
          title: "Kitap oku",
          progress: 0,
          total: 10,
          completed: false,
        },
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
    if (!user) return res.json([]);

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

    // 🔥 DEBUG
    console.log("OLD PROGRESS:", task.progress);

    // 🔥 PROGRESS ARTIR
    task.progress += 1;

    console.log("NEW PROGRESS:", task.progress);

    let leveledUp = false;

    // 🎯 TASK COMPLETE
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

    // 🔥 STREAK SYSTEM
    const today = new Date();
    const lastDate = user.lastActiveDate
      ? new Date(user.lastActiveDate)
      : null;

    const diffTime = lastDate ? today - lastDate : null;
    const diffDays = diffTime
      ? Math.floor(diffTime / (1000 * 60 * 60 * 24))
      : null;

    if (!lastDate) {
      user.streak = 1;
    } else if (diffDays === 0) {
      // aynı gün → değişmez
    } else if (diffDays === 1) {
      user.streak += 1;
    } else {
      user.streak = 1;
    }

    user.lastActiveDate = today;

    await user.save();

    res.json({
      player: user,
      task: task,
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