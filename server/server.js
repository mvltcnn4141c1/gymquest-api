const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB bağlandı 🚀"))
  .catch(err => console.log(err));

/* 👤 SCHEMA */
const userSchema = new mongoose.Schema({
  username: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  coins: { type: Number, default: 0 },

  // 🔥 BOOST
  xpBoost: { type: Boolean, default: false },

  lastDailyReset: { type: Date, default: Date.now },

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
});

const User = mongoose.model("User", userSchema);

/* DAILY */
const checkDailyReset = (user) => {
  const now = new Date();
  const last = new Date(user.lastDailyReset);

  if (now.toDateString() !== last.toDateString()) {
    user.tasks.forEach(t => {
      t.progress = 0;
      t.completed = false;
    });
    user.lastDailyReset = now;
  }
};

/* STREAK */
const updateStreak = (user) => {
  const today = new Date();
  const last = user.lastActiveDate ? new Date(user.lastActiveDate) : null;

  if (!last) user.streak = 1;
  else {
    const diff = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    if (diff === 1) user.streak += 1;
    else if (diff > 1) user.streak = 1;
  }

  user.lastActiveDate = today;
};

/* ROOT */
app.get("/", (req, res) => {
  res.send("API çalışıyor 🚀");
});

/* RESET */
app.get("/reset", async (req, res) => {
  await User.deleteMany({});
  res.send("reset ok");
});

/* USER */
app.get("/create-user", async (req, res) => {
  let user = await User.findOne();

  if (!user) {
    user = new User({
      username: "Yusuf",
      tasks: [
        { title: "Spor yap" },
        { title: "Kitap oku" },
      ],
    });
  }

  checkDailyReset(user);
  await user.save();

  res.json(user);
});

/* TASKS */
app.get("/tasks", async (req, res) => {
  const user = await User.findOne();

  if (user) {
    checkDailyReset(user);
    await user.save();
  }

  res.json(user?.tasks || []);
});

/* 🔥 SHOP BUY */
app.post("/buy-xp-boost", async (req, res) => {
  const { userId } = req.body;

  const user = await User.findById(userId);

  if (user.coins < 50) {
    return res.json({ error: "Coin yetersiz" });
  }

  user.coins -= 50;
  user.xpBoost = true;

  await user.save();

  res.json({ player: user });
});

/* PROGRESS */
app.post("/progress-task", async (req, res) => {
  const { userId, taskId } = req.body;

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User yok" });

  checkDailyReset(user);
  updateStreak(user);

  const task = user.tasks.id(taskId);

  let leveledUp = false;

  if (!task.completed) {
    task.progress += 1;

    if (task.progress >= task.total) {
      task.completed = true;

      let xpGain = 50;
      let coinGain = 10;

      // 🔥 BOOST
      if (user.xpBoost) {
        xpGain *= 1.5;
      }

      if (user.streak >= 3) {
        xpGain += 20;
        coinGain += 5;
      }

      user.xp += xpGain;
      user.coins += coinGain;

      if (user.xp >= user.level * 100) {
        user.level += 1;
        user.xp = 0;
        leveledUp = true;
      }
    }
  }

  await user.save();

  res.json({
    player: user,
    task,
    leveledUp,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server çalıştı 🚀");
});