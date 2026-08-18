import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { ExerciseImageTile } from '@/components/ExerciseImageTile';
import { collapseTags } from '@/lib/catalog/catalog-filter';
import { useThemeColors } from '@/lib/theme-colors';

// The row's chip budget: past this many tags the remainder collapses into a single "+N" chip so
// the muscle/equipment line can never wrap past its two-line allowance (UI-SPEC E2 overflow row).
const MAX_VISIBLE_ROW_TAGS = 3;

export interface ExerciseListRowProps {
  name: string;
  imageUri: string | null;
  tags: string[];
  onPress: () => void;
}

// A populated list row: thumbnail, name, up to two wrapped lines of tag chips (collapsing past
// MAX_VISIBLE_ROW_TAGS into a single overflow chip), and a chevron — the whole row is the tap
// target and holds the 48x48 minimum. ExerciseImageTile alone decides between a real image and
// the muted placeholder tile for both the missing-thumbnail and the load-failure case, so this
// row never renders its own second broken-image state.
export function ExerciseListRow({ name, imageUri, tags, onPress }: ExerciseListRowProps) {
  const colors = useThemeColors();
  const { visible, overflowCount } = collapseTags(tags, MAX_VISIBLE_ROW_TAGS);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      className="flex-row items-center gap-sm rounded-md bg-surface px-md py-sm"
      style={{ minHeight: 48 }}
    >
      <View style={{ width: 56 }}>
        <ExerciseImageTile uri={imageUri} />
      </View>

      <View className="flex-1 gap-xs">
        <Text className="text-body font-normal text-foreground" numberOfLines={1}>
          {name}
        </Text>

        {tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-xs">
            {visible.map((tag, index) => (
              <View key={`${tag}-${index}`} className="rounded-sm border border-foreground-muted px-xs">
                <Text className="text-label font-normal text-foreground-muted" numberOfLines={1}>
                  {tag}
                </Text>
              </View>
            ))}
            {overflowCount > 0 ? (
              <View className="rounded-sm border border-foreground-muted px-xs">
                <Text className="text-label font-normal text-foreground-muted">{`+${overflowCount}`}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
    </Pressable>
  );
}
