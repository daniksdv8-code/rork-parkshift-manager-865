import { Stack } from "expo-router";
import { useColors } from "@/providers/ThemeProvider";

export default function CheckinLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Заезд" }} />
    </Stack>
  );
}
