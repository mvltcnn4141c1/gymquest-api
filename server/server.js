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

/* 👤 CREATE USER */
app.get("/create-user", async (req, res) => {
  try {
    const newUser = new User({
      username: "Yusuf",
      xp: 0,
      level: 1,
      tasks: [
        { title: "Spor yap", progress: 0, total: 10 },
        { title: "Kitap oku", progress: 0, total: 10 },
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
    const user = await User.findOne();

    if (!user) return res.json([]);

    res.json(user.tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 🔥 XP */
app.post("/add-xp", async (req, res) => {
  try {
    const { xp } = req.body;

    let user = await User.findOne();
    if (!user) return res.status(404).json({ error: "User yok" });

    user.xp += xp;

    let leveledUp = false;
    const neededXP = user.level * 100;

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

/* 📈 TASK PROGRESS */
app.post("/progress-task", async (req, res) => {
  try {
    const { title, amount } = req.body;

    let user = await User.findOne();
    if (!user) return res.status(404).json({ error: "User yok" });

    const task = user.tasks.find((t) => t.title === title);
    if (!task) return res.status(404).json({ error: "Task yok" });

    if (task.completed) {
      return res.json({ message: "Zaten tamamlandı" });
    }

    task.progress += amount;

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

    await user.save();

    res.json({
      tasks: user.tasks,
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