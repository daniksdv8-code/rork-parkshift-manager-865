import { Stack } from "expo-router";
import { useColors } from "@/providers/ThemeProvider";

export default function ParkingLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Парковка" }} />
    </Stack>
  );
}
