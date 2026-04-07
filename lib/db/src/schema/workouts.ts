import { pgTable, text, integer, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workoutsTable = pgTable("workouts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  exerciseType: text("exercise_type").notNull(),
  exerciseName: text("exercise_name").notNull(),
  sets: integer("sets").notNull().default(1),
  reps: integer("reps").notNull().default(0),
  duration: integer("duration").notNull().default(0),
  weight: real("weight"),
  xpEarned: integer("xp_earned").notNull().default(0),
  estimatedCalories: integer("estimated_calories").notNull().default(0),
  estimatedDurationMin: integer("estimated_duration_min").notNull().default(0),
  isVerified: boolean("is_verified").notNull().default(true),
  isPendingApproval: boolean("is_pending_approval").notNull().default(false),
  healthSource: text("health_source").default("manual"),
  mode: text("mode").notNull().default("free"),
  wasRecommendedUsed: boolean("was_recommended_used").notNull().default(false),
  wasModified: boolean("was_modified").notNull().default(false),
  serverWarnings: text("server_warnings"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workoutAuditLogsTable = pgTable("workout_audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  workoutId: text("workout_id"),
  eventType: text("event_type").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWorkoutSchema = createInsertSchema(workoutsTable).omit({
  createdAt: true,
});

export type InsertWorkout = z.infer<typeof insertWorkoutSchema>;
export type Workout = typeof workoutsTable.$inferSelect;
export type WorkoutAuditLog = typeof workoutAuditLogsTable.$inferSelect;
