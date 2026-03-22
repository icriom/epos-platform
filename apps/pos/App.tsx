import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import PinLoginScreen from "./src/screens/auth/PinLoginScreen";
import TablePlanScreen from "./src/screens/pos/TablePlanScreen";
import OrderScreen from "./src/screens/pos/OrderScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="PinLogin"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0F1923" },
        }}
      >
        <Stack.Screen name="PinLogin" component={PinLoginScreen} />
        <Stack.Screen name="TablePlan" component={TablePlanScreen} />
        <Stack.Screen name="Order" component={OrderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
