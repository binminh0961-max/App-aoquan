import 'react-native-gesture-handler'; // must be first
import 'react-native-reanimated';
import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CameraPickerScreen } from './src/screens/CameraPickerScreen';
import { ImagePickerScreen } from './src/screens/ImagePickerScreen';
import { OutfitSuggestionScreen } from './src/screens/OutfitSuggestionScreen';
import { FashionColor } from './src/constants/fashionColors';

export type RootStackParamList = {
  CameraPicker: undefined;
  ImagePicker: { imageUri?: string } | undefined;
  OutfitSuggestion: { baseColor: FashionColor; baseRole?: 'top' | 'bottom' };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="CameraPicker"
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: '#121212' },
            }}
          >
            <Stack.Screen name="CameraPicker" component={CameraPickerScreen} />
            <Stack.Screen name="ImagePicker" component={ImagePickerScreen} />
            <Stack.Screen
              name="OutfitSuggestion"
              component={OutfitSuggestionScreen}
              options={{
                contentStyle: { backgroundColor: '#F8F9FA' },
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
