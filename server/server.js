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

  xpBoost: { type: Boolean, default: false },

  lastDailyReset: { type: Date, default: Date.now },

  streak: { type: Number, default: 0 },
  lastActiveDate: { type: Date, default: null },

  quests: [
    {
      title: String,
      goal: Number,
      progress: { type: Number, default: 0 },
      completed: { type: Boolean, default: false },
      rewardXP: Number,
      rewardCoin: Number,
    },
  ],

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

/* QUEST */
const generateQuests = () => [
  { title: "3 görev yap", goal: 3, rewardXP: 50, rewardCoin: 20 },
  { title: "10 ilerleme yap", goal: 10, rewardXP: 80, rewardCoin: 30 },
];

/* DAILY */
const checkDailyReset = (user) => {
  const now = new Date();
  if (now.toDateString() !== new Date(user.lastDailyReset).toDateString()) {
    user.tasks.forEach(t => {
      t.progress = 0;
      t.completed = false;
    });
    user.quests = generateQuests();
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
    if (diff === 1) user.streak++;
    else if (diff > 1) user.streak = 1;
  }

  user.lastActiveDate = today;
};

/* ROOT */
app.get("/", (req, res) => res.send("API çalışıyor 🚀"));

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
      quests: generateQuests(),
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

/* QUESTS */
app.get("/quests", async (req, res) => {
  const user = await User.findOne();
  res.json(user?.quests || []);
});

/* 🏆 LEADERBOARD */
app.get("/leaderboard", async (req, res) => {
  const users = await User.find()
    .sort({ level: -1, xp: -1 })
    .limit(10);

  res.json(users);
});

/* PROGRESS */
app.post("/progress-task", async (req, res) => {
  const { userId, taskId } = req.body;

  const user = await User.findById(userId);

  checkDailyReset(user);
  updateStreak(user);

  const task = user.tasks.id(taskId);

  if (!task.completed) {
    task.progress++;

    user.quests.forEach(q => {
      if (!q.completed) {
        q.progress++;
        if (q.progress >= q.goal) {
          q.completed = true;
          user.xp += q.rewardXP;
          user.coins += q.rewardCoin;
        }
      }
    });

    if (task.progress >= task.total) {
      task.completed = true;

      let xpGain = 50;
      let coinGain = 10;

      if (user.xpBoost) xpGain *= 1.5;

      user.xp += xpGain;
      user.coins += coinGain;

      if (user.xp >= user.level * 100) {
        user.level++;
        user.xp = 0;
      }
    }
  }

  await user.save();

  res.json({ player: user });
});

app.listen(3000, () => console.log("Server çalıştı 🚀"));