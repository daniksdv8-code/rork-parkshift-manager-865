import { Stack } from "expo-router";
import { useColors } from "@/providers/ThemeProvider";

export default function DashboardLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          color: colors.text,
          fontSize: 17,
          fontWeight: '700' as const,
        },
        headerShadowVisible: false,

        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "ParkManager" }} />
      <Stack.Screen name="cash-today" options={{ title: "Наличные сегодня" }} />
      <Stack.Screen name="card-today" options={{ title: "Безнал сегодня" }} />
      <Stack.Screen name="parked-now" options={{ title: "На парковке" }} />
      <Stack.Screen name="debt-payments" options={{ title: "Оплаты долгов" }} />
      <Stack.Screen name="debtors-list" options={{ title: "Должники" }} />
      <Stack.Screen name="debts-list" options={{ title: "Все долги" }} />
    </Stack>
  );
}
