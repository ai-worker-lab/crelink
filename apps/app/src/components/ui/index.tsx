import { color, corner, font, space } from '@crelink/design-tokens';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  type ColorValue,
  type TextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const frameBorderWidth = 2;

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[styles.text, style]} />;
}

/**
 * 디자인 토큰 `corner`의 계단형 모서리를 View 조각으로 그린다.
 * 부모 View/Pressable의 첫 자식으로 두고, 부모에는 배경·테두리를 주지 않는다.
 * 배경은 겹치지 않는 세 조각(가운데 세로 띠 + 좌우 기둥)이라 반투명 색도 한 번만 칠해진다.
 */
export function PixelFrame({
  size = 'sm',
  fill = 'transparent',
  border,
}: {
  size?: keyof typeof corner;
  fill?: ColorValue;
  border?: ColorValue;
}) {
  const inset = corner[size];
  const width = border ? frameBorderWidth : 0;
  return (
    <>
      <View
        style={[
          styles.frameLayer,
          {
            top: 0,
            bottom: 0,
            left: inset,
            right: inset,
            backgroundColor: fill,
            borderTopWidth: width,
            borderBottomWidth: width,
            borderColor: border,
          },
        ]}
      />
      <View
        style={[
          styles.frameLayer,
          {
            top: inset,
            bottom: inset,
            left: 0,
            width: inset,
            backgroundColor: fill,
            borderLeftWidth: width,
            borderColor: border,
          },
        ]}
      />
      <View
        style={[
          styles.frameLayer,
          {
            top: inset,
            bottom: inset,
            right: 0,
            width: inset,
            backgroundColor: fill,
            borderRightWidth: width,
            borderColor: border,
          },
        ]}
      />
    </>
  );
}

type ButtonVariant = 'primary' | 'outline';
type ButtonTone = {
  size: keyof typeof corner;
  fill: ColorValue;
  pressedFill: ColorValue;
  border?: ColorValue;
  pressedBorder?: ColorValue;
  text: string;
};
// primary = action.primary 채움, outline = 선 테두리. 눌림은 색 교체만 한다.
const buttonTones: Record<ButtonVariant, ButtonTone> = {
  primary: {
    size: 'md',
    fill: color.action.primary,
    pressedFill: color.action.primaryPressed,
    text: color.text.onAction,
  },
  outline: {
    size: 'sm',
    fill: 'transparent',
    pressedFill: 'transparent',
    border: color.border.default,
    pressedBorder: color.action.primary,
    text: color.text.primary,
  },
};
export function ActionButton({
  title,
  onPress,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
}) {
  const tone = buttonTones[variant];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      {({ pressed }) => (
        <>
          <PixelFrame
            size={tone.size}
            fill={pressed ? tone.pressedFill : tone.fill}
            border={pressed ? (tone.pressedBorder ?? tone.border) : tone.border}
          />
          <Text style={[styles.buttonText, { color: tone.text }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}
/** 패널·카드. md 계단형 모서리와 기본 테두리를 쓴다. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <View style={styles.card}>
      <PixelFrame size="md" fill={color.surface.default} border={color.border.default} />
      {children}
    </View>
  );
}
export function Screen({ children, title }: { children: ReactNode; title: string }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text accessibilityRole="header" style={styles.heading}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export const uiStyles = StyleSheet.create({
  title: { fontSize: font.size[18], fontWeight: font.weight.bold, color: color.text.primary },
});
const styles = StyleSheet.create({
  frameLayer: { position: 'absolute', pointerEvents: 'none' },
  safe: { flex: 1, backgroundColor: color.background.screen },
  page: { padding: space[20], paddingBottom: space[48], gap: space[12] },
  text: { color: color.text.primary, fontSize: font.size[15], lineHeight: 23 },
  heading: { fontSize: font.size[27], lineHeight: 36, fontWeight: font.weight.extrabold, color: color.text.primary },
  card: { padding: space[16], gap: space[8] },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[16] },
  buttonText: { fontSize: font.size[16], fontWeight: font.weight.bold },
});
