const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");


console.log("SERVER BAŞLADI 🔥");

const app = express();
app.use(cors());
app.use(express.json());

/* 🔥 Mongo */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB bağlandı 🚀"))
  .catch(err => console.log(err));

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
});

const User = mongoose.model("User", userSchema);

/* TEST */
app.get("/", (req, res) => {
  res.send("API çalışıyor 🚀");
});

/* USER */
app.get("/create-user", async (req, res) => {
  try {
    let user = await User.findOne();

    if (!user) {
      user = new User({
        username: "Yusuf",
        tasks: [
          { title: "Spor yap" },
          { title: "Kitap oku" },
        ],
      });
      await user.save();
    }

    res.json(user);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* TASKS */
app.get("/tasks", async (req, res) => {
  const user = await User.findOne();
  res.json(user ? user.tasks : []);
});

/* 🔥 PROGRESS */
app.post("/progress-task", async (req, res) => {
  try {
    console.log("HIT PROGRESS 🚀");

    const { userId, taskId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User yok" });

    const task = user.tasks.id(taskId);
    if (!task) return res.status(404).json({ error: "Task yok" });

    let leveledUp = false;

    if (!task.completed) {
      task.progress += 1;

      if (task.progress >= task.total) {
        task.progress = task.total;
        task.completed = true;

        user.xp += 50;
        
// 🔥 RESET (BURAYA KOY)
app.get("/reset", async (req, res) => {
  try {
    await User.deleteMany({});
    res.send("Database temizlendi 🧹");
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
        

        // ✅ SADECE BURADA TANIMLI
        const neededXP = user.level * 100;

        if (user.xp >= neededXP) {
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

  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* SERVER */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server çalıştı 🚀");
  console.log("PORT:", PORT);
});