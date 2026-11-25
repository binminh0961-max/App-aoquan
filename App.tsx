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
import { MatchCheckerScreen } from './src/screens/MatchCheckerScreen';
import { LookbookScreen } from './src/screens/LookbookScreen';
import { CompareOutfitsScreen } from './src/screens/CompareOutfitsScreen';
import { FashionColor } from './src/constants/fashionColors';
import { SavedOutfit } from './src/services/lookbookStorage';
import {
  CompareContext,
  MatchItemSelection,
  StudioPresetOutfit,
} from './src/types/outfit';

export type RootStackParamList = {
  CameraPicker: { compareContext?: CompareContext } | undefined;
  ImagePicker: { imageUri?: string; compareContext?: CompareContext } | undefined;
  OutfitSuggestion: {
    baseColor: FashionColor;
    baseRole?: 'top' | 'bottom';
    initialPresetOutfit?: StudioPresetOutfit;
    loadSavedOutfit?: SavedOutfit;
  };
  MatchChecker: {
    item1: MatchItemSelection;
    item2: MatchItemSelection;
  };
  Lookbook: undefined;
  CompareOutfits: {
    outfitA: SavedOutfit;
    outfitB: SavedOutfit;
  };
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
                contentStyle: { backgroundColor: '#A8A8A5' },
              }}
            />
            <Stack.Screen
              name="MatchChecker"
              component={MatchCheckerScreen}
              options={{
                contentStyle: { backgroundColor: '#F5F5F3' },
              }}
            />
            <Stack.Screen
              name="Lookbook"
              component={LookbookScreen}
              options={{
                contentStyle: { backgroundColor: '#F4F4F1' },
              }}
            />
            <Stack.Screen
              name="CompareOutfits"
              component={CompareOutfitsScreen}
              options={{
                contentStyle: { backgroundColor: '#F4F4F1' },
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
