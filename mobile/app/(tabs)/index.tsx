import { useEffect, useState, useRef } from "react";
import { View, Text, Button, Pressable, Animated } from "react-native";

export default function HomeScreen() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [player, setPlayer] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ✅ CANLI API (Render)
  const API = "https://gymquest-api.onrender.com";

  // 🎮 XP ANİMASYON
  const playXPAnimation = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.5,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // 📋 TASKS ÇEK
  const fetchTasks = async () => {
    try {
      const res = await fetch(API + "/tasks");
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.log("TASK ERROR:", err);
    }
  };

  // 👤 PLAYER ÇEK / OLUŞTUR
  const fetchPlayer = async () => {
    try {
      const res = await fetch(API + "/create-user");
      const data = await res.json();
      setPlayer(data);
    } catch (err) {
      console.log("PLAYER ERROR:", err);
    }
  };

  // 🔥 XP EKLE
  const completeTask = async (task: any) => {
    try {
      const res = await fetch(API + "/add-xp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ xp: 50 }),
      });

      const data = await res.json();

      console.log("XP RESPONSE:", data);

      // PLAYER GÜNCELLE
      setPlayer((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          xp: data.xp,
          level: data.level,
        };
      });

      // TASK COMPLETE
      setTasks((prev) =>
        prev.map((t) =>
          t.title === task.title ? { ...t, completed: true } : t
        )
      );

      playXPAnimation();

      // ✅ DOĞRU KEY
      if (data.leveledUp) {
        alert("LEVEL UP 🔥");
      }

      setRefreshKey((prev) => prev + 1);

    } catch (err) {
      console.log("XP ERROR:", err);
    }
  };

  // 🚀 BAŞLANGIÇ
  useEffect(() => {
    fetchTasks();
    fetchPlayer();
  }, []);

  return (
    <View key={refreshKey} style={{ marginTop: 50, padding: 20 }}>

      {player && (
        <>
          <Text style={{ fontSize: 18 }}>
            🧑 {player.username} | Level {player.level} | XP {player.xp}
          </Text>

          {/* XP BAR */}
          <View
            style={{
              height: 10,
              width: "100%",
              backgroundColor: "#ddd",
              borderRadius: 5,
              marginVertical: 10,
            }}
          >
            <View
              style={{
                height: 10,
                width: `${player.xp % 100}%`,
                backgroundColor: "#4caf50",
                borderRadius: 5,
              }}
            />
          </View>

          {/* ✨ XP ANİMASYON */}
          <Animated.Text
            style={{
              transform: [{ scale: scaleAnim }],
              fontSize: 18,
              color: "gold",
              marginBottom: 10,
            }}
          >
            +XP 🚀
          </Animated.Text>
        </>
      )}

      <Button
        title="Yenile"
        onPress={() => {
          fetchTasks();
          fetchPlayer();
        }}
      />

      {tasks.map((task, index) => (
        <Pressable
          key={index}
          onPress={() => completeTask(task)}
          style={{
            marginTop: 10,
            padding: 15,
            backgroundColor: task.completed ? "#ddd" : "#cce5ff",
            borderRadius: 10,
          }}
        >
          <Text>
            {task.title} {task.completed ? "✅" : "❌"} (+XP)
          </Text>
        </Pressable>
      ))}

    </View>
  );
}