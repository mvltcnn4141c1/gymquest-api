import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";

export default function HomeScreen() {
  const API_URL = "https://gymquest-api.onrender.com";

  const [tasks, setTasks] = useState<any[]>([]);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showLevelUp, setShowLevelUp] = useState(false);

  // 🔥 XP HESAP
  const neededXP = player?.level * 100;
  const xpPercent = player && neededXP ? (player.xp / neededXP) * 100 : 0;

  // 👤 USER OLUŞTUR
  const createUser = async () => {
    try {
      const res = await fetch(`${API_URL}/create-user`, {
        method: "POST",
      });

      const data = await res.json();
      console.log("USER:", data);

      return data;
    } catch (err) {
      console.log("USER ERROR:", err);
      return null;
    }
  };

  // 📋 TASK GETİR
  const getTasks = async () => {
    try {
      const res = await fetch(`${API_URL}/tasks`);
      const data = await res.json();

      console.log("TASKS:", data);

      if (Array.isArray(data)) {
        setTasks(data);
      } else {
        setTasks([]);
      }
    } catch (err) {
      console.log("TASK ERROR:", err);
      setTasks([]);
    }
  };

  // 📈 TASK İLERLET
  const progressTask = async (taskId: string) => {
    try {
      if (!player?._id) return;

      const res = await fetch(`${API_URL}/progress-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: player._id,
          taskId: taskId,
        }),
      });

      const data = await res.json();
      console.log("PROGRESS:", data);

      // PLAYER GÜNCELLE
      if (data.player) {
        setPlayer(data.player);
      }

      // 🔥 LEVEL UP KONTROL
      if (data.leveledUp) {
        setShowLevelUp(true);

        setTimeout(() => {
          setShowLevelUp(false);
        }, 2000);
      }

      // TASK GÜNCELLE
      if (data.task) {
        setTasks((prev) =>
          prev.map((t) =>
            t._id === taskId ? data.task : t
          )
        );
      }

    } catch (err) {
      console.log("PROGRESS ERROR:", err);
    }
  };

  // 🚀 İLK YÜKLEME
  useEffect(() => {
    const init = async () => {
      try {
        const user = await createUser();
        if (user) setPlayer(user);

        await getTasks();
      } catch (err) {
        console.log("INIT ERROR:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // ⏳ LOADING
  if (loading || !player) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* 🎉 LEVEL UP */}
      {showLevelUp && (
        <View style={styles.levelUpBox}>
          <Text style={styles.levelUpText}>🎉 LEVEL UP!</Text>
        </View>
      )}

      {/* 👤 PLAYER */}
      <Text style={styles.title}>Level: {player.level}</Text>

      {/* 🔥 XP BAR */}
      <View style={styles.xpBarBackground}>
        <View
          style={[
            styles.xpBarFill,
            { width: `${xpPercent}%` },
          ]}
        />
      </View>

      <Text>
        {player.xp} / {neededXP} XP
      </Text>

      {/* 📋 TASKS */}
      {tasks?.length === 0 ? (
        <Text>Görev yok</Text>
      ) : (
        tasks.map((task) => (
          <View key={task._id} style={styles.taskBox}>
            <Text style={styles.taskTitle}>{task.title}</Text>

            <Text>
              {task?.progress ?? 0} / {task?.total ?? 10}
            </Text>

            <Pressable
              style={styles.button}
              onPress={() => progressTask(task._id)}
            >
              <Text style={styles.buttonText}>Yap (+)</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

// 🎨 STYLE
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    marginTop: 40,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
  },

  // 🔥 XP BAR
  xpBarBackground: {
    width: "100%",
    height: 20,
    backgroundColor: "#ddd",
    borderRadius: 10,
    marginTop: 10,
  },
  xpBarFill: {
    height: "100%",
    backgroundColor: "green",
    borderRadius: 10,
  },

  // 🎉 LEVEL UP
  levelUpBox: {
    position: "absolute",
    top: 100,
    alignSelf: "center",
    backgroundColor: "gold",
    padding: 20,
    borderRadius: 15,
    zIndex: 999,
  },
  levelUpText: {
    fontSize: 24,
    fontWeight: "bold",
  },

  taskBox: {
    padding: 15,
    marginTop: 15,
    backgroundColor: "#eee",
    borderRadius: 10,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  button: {
    marginTop: 10,
    backgroundColor: "black",
    padding: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
  },
});