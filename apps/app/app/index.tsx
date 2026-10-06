import { color, space } from '@crelink/design-tokens';
import { API_PATHS, type ReadinessResponse } from '@crelink/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ActionButton, Card, Screen, Text, uiStyles } from '../src/components/ui';
import { apiRequest } from '../src/lib/api/client';

type HealthState = { status: 'loading' } | { status: 'ok' } | { status: 'error'; message: string };

/** 초기 시작 화면. 제품 기능이 아니라 앱 실행과 API·DB 준비 상태만 확인한다. */
export default function IndexRoute() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });
  const check = useCallback(async () => {
    setHealth({ status: 'loading' });
    try {
      await apiRequest<ReadinessResponse>(API_PATHS.ready);
      setHealth({ status: 'ok' });
    } catch (caught) {
      setHealth({
        status: 'error',
        message: caught instanceof Error ? caught.message : 'API·DB 상태를 확인하지 못했습니다.',
      });
    }
  }, []);
  useEffect(() => {
    void check();
  }, [check]);

  return (
    <Screen title="crelink">
      <Text style={styles.concept}>{'서비스 소개는 아직 정하지 않았습니다.'}</Text>
      <Text style={styles.note}>
        현재 화면과 API·DB 상태 확인은 초기 시작점이며 제품 기능은 아직 구현되지 않았습니다.
      </Text>
      <Card>
        <Text style={uiStyles.title}>API·DB 상태</Text>
        {health.status === 'loading' ? (
          <View style={styles.row}>
            <ActivityIndicator color={color.action.primary} />
            <Text>확인하고 있어요.</Text>
          </View>
        ) : null}
        {health.status === 'ok' ? <Text style={styles.ok}>정상</Text> : null}
        {health.status === 'error' ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>
              {health.message}
            </Text>
            <ActionButton title="다시 시도" variant="outline" onPress={() => void check()} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({
  concept: { color: color.text.secondary },
  note: { color: color.text.subtle },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[10] },
  ok: { color: color.status.positive },
  error: { color: color.status.danger },
});
