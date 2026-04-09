import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from "react-native";

export default function HomeScreen() {
  const API_URL = "https://gymquest-api.onrender.com";

  const [tasks, setTasks] = useState<any[]>([]);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showLevelUp, setShowLevelUp] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  const neededXP = player?.level * 100 || 100;
  const xpPercent = player ? (player.xp / neededXP) * 100 : 0;

  // 🔥 USER
  const createUser = async () => {
    const res = await fetch(`${API_URL}/create-user`);
    const data = await res.json();
    setPlayer(data);
  };

  // 📋 TASKS
  const getTasks = async () => {
    const res = await fetch(`${API_URL}/tasks`);
    const data = await res.json();
    setTasks(data);
  };

  // 🚀 PROGRESS
  const progressTask = async (taskId: string) => {
    if (!player) return;

    try {
      const res = await fetch(`${API_URL}/progress-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: player._id,
          taskId,
        }),
      });

      const data = await res.json();

      if (data.player) {
        setPlayer(data.player);
      }

      if (data.leveledUp) {
        setShowLevelUp(true);
        setTimeout(() => setShowLevelUp(false), 2000);
      }

      getTasks();
    } catch (err) {
      console.log(err);
    }
  };

  // 🔄 INIT
  useEffect(() => {
    const init = async () => {
      await createUser();
      await getTasks();
      setLoading(false);
    };
    init();
  }, []);

  // 🎯 XP ANİMASYON
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: xpPercent,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [xpPercent]);

  if (loading || !player) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const widthInterpolate = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.level}>Level: {player.level}</Text>

      {/* XP BAR */}
      <View style={styles.bar}>
        <Animated.View
          style={[styles.fill, { width: widthInterpolate }]}
        />
      </View>
      <Text style={styles.xp}>
        {player.xp} / {neededXP} XP
      </Text>

      {/* TASKS */}
      {tasks.map((task) => (
        <View key={task._id} style={styles.card}>
          <Text style={styles.title}>
            {task.title} ({task.progress}/{task.total})
          </Text>

          <Pressable
            style={styles.button}
            onPress={() => progressTask(task._id)}
          >
            <Text style={styles.buttonText}>Yap (+)</Text>
          </Pressable>
        </View>
      ))}

      {/* LEVEL UP */}
      {showLevelUp && (
        <View style={styles.levelUp}>
          <Text style={styles.levelUpText}>
            🎉 LEVEL UP! {player.level}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  level: {
    fontSize: 22,
    fontWeight: "bold",
  },
  xp: {
    marginBottom: 20,
  },
  bar: {
    height: 20,
    backgroundColor: "#ddd",
    borderRadius: 10,
    overflow: "hidden",
    marginVertical: 10,
  },
  fill: {
    height: "100%",
    backgroundColor: "green",
  },
  card: {
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    marginBottom: 5,
  },
  button: {
    backgroundColor: "black",
    padding: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
  },
  levelUp: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  levelUpText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "green",
  },
});