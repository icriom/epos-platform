import React from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import PinLoginScreen from "./src/screens/auth/PinLoginScreen";
import TablePlanScreen from "./src/screens/pos/TablePlanScreen";
import OrderScreen from "./src/screens/pos/OrderScreen";
import PaymentScreen from "./src/screens/pos/PaymentScreen";
import ReportsScreen from "./src/screens/reports/ReportsScreen";
import ZReadScreen from "./src/screens/reports/ZReadScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <View style={{ flex: 1, width: "100%" }}>
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
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="Reports" component={ReportsScreen} />
          <Stack.Screen name="ZRead" component={ZReadScreen} />
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  );
}
