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

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[styles.text, style]} />;
}

type ButtonVariant = 'primary' | 'outline';
type ButtonTone = {
  fill: ColorValue;
  pressedFill: ColorValue;
  border: ColorValue;
  pressedBorder: ColorValue;
  text: string;
};
// primary = action.primary 채운 알약형, outline = 흰 면에 선 테두리. 눌림은 색 교체만 한다(design/system/DESIGN.md 컴포넌트 절).
const buttonTones: Record<ButtonVariant, ButtonTone> = {
  primary: {
    fill: color.action.primary,
    pressedFill: color.action.primaryPressed,
    border: color.action.primary,
    pressedBorder: color.action.primaryPressed,
    text: color.text.onAction,
  },
  outline: {
    fill: color.surface.default,
    pressedFill: color.surface.raised,
    border: color.border.default,
    pressedBorder: color.text.primary,
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
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? tone.pressedFill : tone.fill,
          borderColor: pressed ? tone.pressedBorder : tone.border,
        },
      ]}
    >
      <Text style={[styles.buttonText, { color: tone.text }]}>{title}</Text>
    </Pressable>
  );
}
/** 패널·카드. 흰 면, 1px 기본 테두리, corner.lg 둥근 모서리. */
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
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
  safe: { flex: 1, backgroundColor: color.background.stage },
  page: { padding: space[20], paddingBottom: space[48], gap: space[12] },
  text: { color: color.text.primary, fontSize: font.size[15], lineHeight: 23 },
  heading: { fontSize: font.size[27], lineHeight: 36, fontWeight: font.weight.extrabold, color: color.text.primary },
  card: {
    padding: space[16],
    gap: space[8],
    borderWidth: 1,
    borderColor: color.border.default,
    borderRadius: corner.lg,
    backgroundColor: color.surface.default,
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[20],
    borderWidth: 1,
    borderRadius: corner.full,
  },
  buttonText: { fontSize: font.size[16], fontWeight: font.weight.bold },
});
