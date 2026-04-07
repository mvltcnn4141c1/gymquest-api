import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
export default function HomeScreen() {

  const API_URL = "https://gymquest-api.onrender.com"; // ✅ BURADA

  console.log("API:", API_URL); // ✅ BURAYA KOY

  const [tasks, setTasks] = useState<any[]>([]);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Kullanıcıyı oluştur / çek
 const createUser = async () => {
  try {
    const res = await fetch(`${API_URL}/create-user`, {
      method: "POST",
    });

    const data = await res.json();

    console.log("USER:", data); // ✅ BURAYA

    setPlayer(data);
  } catch (err) {
    console.log("USER ERROR:", err);
  }
};

  // Görevleri çek
  const getTasks = async () => {
  try {
    const res = await fetch(`${API_URL}/tasks`);
    const data = await res.json();

    console.log("TASKS:", data); // ✅ BURAYA

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
  // Görev ilerlet
  const progressTask = async (taskId: string) => {
    try {
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

      // player güncelle
      setPlayer(data.player);

      // task güncelle (UI refresh)
      setTasks((prev) =>
        prev.map((t) =>
          t._id === taskId ? { ...t, progress: data.task.progress } : t
        )
      );
    } catch (err) {
      console.log("PROGRESS ERROR:", err);
    }
  };

  // ilk yükleme
  useEffect(() => {
  const init = async () => {
    try {
      await createUser();
      await getTasks();
    } catch (err) {
      console.log("INIT ERROR:", err);
    } finally {
      setLoading(false); // HER DURUMDA ÇALIŞIR
    }
  };

  init();
}, []);

  // loading ekranı
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
      {/* PLAYER INFO */}
      <Text style={styles.title}>Level: {player.level}</Text>
      <Text>XP: {player.xp}</Text>

      {/* TASK LIST */}
      {tasks.length === 0 ? (
        <Text>Görev yok</Text>
      ) : (
        tasks.map((task) => (
          <View key={task._id} style={styles.taskBox}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text>
              {task.progress} / {task.total}
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