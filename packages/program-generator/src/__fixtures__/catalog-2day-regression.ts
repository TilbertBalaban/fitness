// GENERATED FILE — do not hand-edit.
// Produced by scripts/derive-generator-regression-fixture.cjs (run: `node scripts/derive-generator-regression-fixture.cjs`)
// from apps/api/src/seed/data/catalog-normalized.json.
//
// D-11: the real seeded catalog, trimmed to the muscle groups the 2-day full-body template
// names (6 primary-mapped exercises per group, plus every mapping those
// exercises carry). Committed so the regression suite never depends on apps/api at run time;
// regenerate with the script above whenever the snapshot changes.

import type { GenerationCatalog } from '../result';

export const CATALOG_2DAY_REGRESSION: GenerationCatalog = {
  "exercises": [
    {
      "id": "seed_3_4_Sit-Up",
      "name": "3/4 Sit-Up",
      "equipmentRequired": "bodyweight",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_90_90_Hamstring",
      "name": "90/90 Hamstring",
      "equipmentRequired": "bodyweight",
      "movementPattern": null
    },
    {
      "id": "seed_Ab_Crunch_Machine",
      "name": "Ab Crunch Machine",
      "equipmentRequired": "machine",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Ab_Roller",
      "name": "Ab Roller",
      "equipmentRequired": "other",
      "movementPattern": null
    },
    {
      "id": "seed_Advanced_Kettlebell_Windmill",
      "name": "Advanced Kettlebell Windmill",
      "equipmentRequired": "kettlebell",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Air_Bike",
      "name": "Air Bike",
      "equipmentRequired": "bodyweight",
      "movementPattern": null
    },
    {
      "id": "seed_All_Fours_Quad_Stretch",
      "name": "All Fours Quad Stretch",
      "equipmentRequired": "bodyweight",
      "movementPattern": null
    },
    {
      "id": "seed_Alternate_Hammer_Curl",
      "name": "Alternate Hammer Curl",
      "equipmentRequired": "dumbbell",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Alternate_Heel_Touchers",
      "name": "Alternate Heel Touchers",
      "equipmentRequired": "bodyweight",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Alternate_Incline_Dumbbell_Curl",
      "name": "Alternate Incline Dumbbell Curl",
      "equipmentRequired": "dumbbell",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Alternate_Leg_Diagonal_Bound",
      "name": "Alternate Leg Diagonal Bound",
      "equipmentRequired": null,
      "movementPattern": null
    },
    {
      "id": "seed_Alternating_Cable_Shoulder_Press",
      "name": "Alternating Cable Shoulder Press",
      "equipmentRequired": "cable",
      "movementPattern": "vertical_push"
    },
    {
      "id": "seed_Alternating_Deltoid_Raise",
      "name": "Alternating Deltoid Raise",
      "equipmentRequired": "dumbbell",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Alternating_Floor_Press",
      "name": "Alternating Floor Press",
      "equipmentRequired": "kettlebell",
      "movementPattern": "horizontal_push"
    },
    {
      "id": "seed_Alternating_Hang_Clean",
      "name": "Alternating Hang Clean",
      "equipmentRequired": "kettlebell",
      "movementPattern": "hinge"
    },
    {
      "id": "seed_Alternating_Kettlebell_Press",
      "name": "Alternating Kettlebell Press",
      "equipmentRequired": "kettlebell",
      "movementPattern": "vertical_push"
    },
    {
      "id": "seed_Ankle_On_The_Knee",
      "name": "Ankle On The Knee",
      "equipmentRequired": null,
      "movementPattern": null
    },
    {
      "id": "seed_Anti-Gravity_Press",
      "name": "Anti-Gravity Press",
      "equipmentRequired": "barbell",
      "movementPattern": "vertical_push"
    },
    {
      "id": "seed_Arm_Circles",
      "name": "Arm Circles",
      "equipmentRequired": null,
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Arnold_Dumbbell_Press",
      "name": "Arnold Dumbbell Press",
      "equipmentRequired": "dumbbell",
      "movementPattern": "vertical_push"
    },
    {
      "id": "seed_Around_The_Worlds",
      "name": "Around The Worlds",
      "equipmentRequired": "dumbbell",
      "movementPattern": null
    },
    {
      "id": "seed_Backward_Drag",
      "name": "Backward Drag",
      "equipmentRequired": "other",
      "movementPattern": "carry"
    },
    {
      "id": "seed_Ball_Leg_Curl",
      "name": "Ball Leg Curl",
      "equipmentRequired": "exercise_ball",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Band_Assisted_Pull-Up",
      "name": "Band Assisted Pull-Up",
      "equipmentRequired": "other",
      "movementPattern": "vertical_pull"
    },
    {
      "id": "seed_Band_Good_Morning_Pull_Through",
      "name": "Band Good Morning (Pull Through)",
      "equipmentRequired": "band",
      "movementPattern": "hinge"
    },
    {
      "id": "seed_Band_Skull_Crusher",
      "name": "Band Skull Crusher",
      "equipmentRequired": "band",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Barbell_Bench_Press_-_Medium_Grip",
      "name": "Barbell Bench Press - Medium Grip",
      "equipmentRequired": "barbell",
      "movementPattern": "horizontal_push"
    },
    {
      "id": "seed_Barbell_Curl",
      "name": "Barbell Curl",
      "equipmentRequired": "barbell",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Barbell_Curls_Lying_Against_An_Incline",
      "name": "Barbell Curls Lying Against An Incline",
      "equipmentRequired": "barbell",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Barbell_Full_Squat",
      "name": "Barbell Full Squat",
      "equipmentRequired": "barbell",
      "movementPattern": "squat"
    },
    {
      "id": "seed_Barbell_Glute_Bridge",
      "name": "Barbell Glute Bridge",
      "equipmentRequired": "barbell",
      "movementPattern": "hinge"
    },
    {
      "id": "seed_Barbell_Guillotine_Bench_Press",
      "name": "Barbell Guillotine Bench Press",
      "equipmentRequired": "barbell",
      "movementPattern": "horizontal_push"
    },
    {
      "id": "seed_Barbell_Hack_Squat",
      "name": "Barbell Hack Squat",
      "equipmentRequired": "barbell",
      "movementPattern": "squat"
    },
    {
      "id": "seed_Barbell_Hip_Thrust",
      "name": "Barbell Hip Thrust",
      "equipmentRequired": "barbell",
      "movementPattern": "hinge"
    },
    {
      "id": "seed_Barbell_Incline_Bench_Press_-_Medium_Grip",
      "name": "Barbell Incline Bench Press - Medium Grip",
      "equipmentRequired": "barbell",
      "movementPattern": "horizontal_push"
    },
    {
      "id": "seed_Barbell_Lunge",
      "name": "Barbell Lunge",
      "equipmentRequired": "barbell",
      "movementPattern": "squat"
    },
    {
      "id": "seed_Behind_Head_Chest_Stretch",
      "name": "Behind Head Chest Stretch",
      "equipmentRequired": "other",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Bench_Dips",
      "name": "Bench Dips",
      "equipmentRequired": "bodyweight",
      "movementPattern": "horizontal_push"
    },
    {
      "id": "seed_Bench_Press_-_Powerlifting",
      "name": "Bench Press - Powerlifting",
      "equipmentRequired": "barbell",
      "movementPattern": "horizontal_push"
    },
    {
      "id": "seed_Bench_Press_with_Chains",
      "name": "Bench Press with Chains",
      "equipmentRequired": "barbell",
      "movementPattern": "horizontal_push"
    },
    {
      "id": "seed_Bent-Arm_Barbell_Pullover",
      "name": "Bent-Arm Barbell Pullover",
      "equipmentRequired": "barbell",
      "movementPattern": "vertical_pull"
    },
    {
      "id": "seed_Board_Press",
      "name": "Board Press",
      "equipmentRequired": "barbell",
      "movementPattern": "horizontal_push"
    },
    {
      "id": "seed_Body-Up",
      "name": "Body-Up",
      "equipmentRequired": "bodyweight",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Box_Jump_Multiple_Response",
      "name": "Box Jump (Multiple Response)",
      "equipmentRequired": "other",
      "movementPattern": null
    },
    {
      "id": "seed_Box_Skip",
      "name": "Box Skip",
      "equipmentRequired": "other",
      "movementPattern": null
    },
    {
      "id": "seed_Brachialis-SMR",
      "name": "Brachialis-SMR",
      "equipmentRequired": "foam_roller",
      "movementPattern": null
    },
    {
      "id": "seed_Butt_Lift_Bridge",
      "name": "Butt Lift (Bridge)",
      "equipmentRequired": "bodyweight",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Cable_Hammer_Curls_-_Rope_Attachment",
      "name": "Cable Hammer Curls - Rope Attachment",
      "equipmentRequired": "cable",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Cable_Incline_Pushdown",
      "name": "Cable Incline Pushdown",
      "equipmentRequired": "cable",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Cable_Seated_Lateral_Raise",
      "name": "Cable Seated Lateral Raise",
      "equipmentRequired": "cable",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Catch_and_Overhead_Throw",
      "name": "Catch and Overhead Throw",
      "equipmentRequired": "medicine_ball",
      "movementPattern": "horizontal_pull"
    },
    {
      "id": "seed_Chair_Lower_Back_Stretch",
      "name": "Chair Lower Back Stretch",
      "equipmentRequired": null,
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Chin-Up",
      "name": "Chin-Up",
      "equipmentRequired": "bodyweight",
      "movementPattern": "vertical_pull"
    },
    {
      "id": "seed_Downward_Facing_Balance",
      "name": "Downward Facing Balance",
      "equipmentRequired": "exercise_ball",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Dumbbell_Lying_One-Arm_Rear_Lateral_Raise",
      "name": "Dumbbell Lying One-Arm Rear Lateral Raise",
      "equipmentRequired": "dumbbell",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Dumbbell_Lying_Rear_Lateral_Raise",
      "name": "Dumbbell Lying Rear Lateral Raise",
      "equipmentRequired": "dumbbell",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Dumbbell_One-Arm_Upright_Row",
      "name": "Dumbbell One-Arm Upright Row",
      "equipmentRequired": "dumbbell",
      "movementPattern": "vertical_pull"
    },
    {
      "id": "seed_Flutter_Kicks",
      "name": "Flutter Kicks",
      "equipmentRequired": "bodyweight",
      "movementPattern": null
    },
    {
      "id": "seed_Lateral_Raise_-_With_Bands",
      "name": "Lateral Raise - With Bands",
      "equipmentRequired": "band",
      "movementPattern": "isolation"
    },
    {
      "id": "seed_Lying_One-Arm_Lateral_Raise",
      "name": "Lying One-Arm Lateral Raise",
      "equipmentRequired": "dumbbell",
      "movementPattern": "isolation"
    }
  ],
  "mappings": [
    {
      "exerciseId": "seed_3_4_Sit-Up",
      "muscleGroupId": "abs",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_90_90_Hamstring",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_90_90_Hamstring",
      "muscleGroupId": "hamstrings",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Ab_Crunch_Machine",
      "muscleGroupId": "abs",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Ab_Roller",
      "muscleGroupId": "abs",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Ab_Roller",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Ab_Roller",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Ab_Roller",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Advanced_Kettlebell_Windmill",
      "muscleGroupId": "abs",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Advanced_Kettlebell_Windmill",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Advanced_Kettlebell_Windmill",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Advanced_Kettlebell_Windmill",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Advanced_Kettlebell_Windmill",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Advanced_Kettlebell_Windmill",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Air_Bike",
      "muscleGroupId": "abs",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_All_Fours_Quad_Stretch",
      "muscleGroupId": "quads",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_All_Fours_Quad_Stretch",
      "muscleGroupId": "quads",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternate_Hammer_Curl",
      "muscleGroupId": "biceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternate_Hammer_Curl",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternate_Heel_Touchers",
      "muscleGroupId": "abs",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternate_Incline_Dumbbell_Curl",
      "muscleGroupId": "biceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternate_Incline_Dumbbell_Curl",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternate_Leg_Diagonal_Bound",
      "muscleGroupId": "abductors",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternate_Leg_Diagonal_Bound",
      "muscleGroupId": "adductors",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternate_Leg_Diagonal_Bound",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternate_Leg_Diagonal_Bound",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternate_Leg_Diagonal_Bound",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternate_Leg_Diagonal_Bound",
      "muscleGroupId": "quads",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternating_Cable_Shoulder_Press",
      "muscleGroupId": "front_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternating_Cable_Shoulder_Press",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.60"
    },
    {
      "exerciseId": "seed_Alternating_Cable_Shoulder_Press",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.45"
    },
    {
      "exerciseId": "seed_Alternating_Deltoid_Raise",
      "muscleGroupId": "front_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternating_Deltoid_Raise",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Deltoid_Raise",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Floor_Press",
      "muscleGroupId": "abs",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Floor_Press",
      "muscleGroupId": "chest",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternating_Floor_Press",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Floor_Press",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Floor_Press",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Floor_Press",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Hang_Clean",
      "muscleGroupId": "biceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Hang_Clean",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Hang_Clean",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Hang_Clean",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Hang_Clean",
      "muscleGroupId": "hamstrings",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternating_Hang_Clean",
      "muscleGroupId": "lower_back",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Hang_Clean",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Kettlebell_Press",
      "muscleGroupId": "front_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Alternating_Kettlebell_Press",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Kettlebell_Press",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Alternating_Kettlebell_Press",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Ankle_On_The_Knee",
      "muscleGroupId": "glutes",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Anti-Gravity_Press",
      "muscleGroupId": "front_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Anti-Gravity_Press",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Anti-Gravity_Press",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Anti-Gravity_Press",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Anti-Gravity_Press",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Anti-Gravity_Press",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Arm_Circles",
      "muscleGroupId": "front_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Arm_Circles",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Arm_Circles",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Arm_Circles",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Arnold_Dumbbell_Press",
      "muscleGroupId": "front_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Arnold_Dumbbell_Press",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Arnold_Dumbbell_Press",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Arnold_Dumbbell_Press",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Around_The_Worlds",
      "muscleGroupId": "chest",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Around_The_Worlds",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Around_The_Worlds",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Around_The_Worlds",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Backward_Drag",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Backward_Drag",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Backward_Drag",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Backward_Drag",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Backward_Drag",
      "muscleGroupId": "lower_back",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Backward_Drag",
      "muscleGroupId": "quads",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Ball_Leg_Curl",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Ball_Leg_Curl",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Ball_Leg_Curl",
      "muscleGroupId": "hamstrings",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Band_Assisted_Pull-Up",
      "muscleGroupId": "abs",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Band_Assisted_Pull-Up",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Band_Assisted_Pull-Up",
      "muscleGroupId": "lats",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Band_Assisted_Pull-Up",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.35"
    },
    {
      "exerciseId": "seed_Band_Good_Morning_Pull_Through",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Band_Good_Morning_Pull_Through",
      "muscleGroupId": "hamstrings",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Band_Good_Morning_Pull_Through",
      "muscleGroupId": "lower_back",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Band_Skull_Crusher",
      "muscleGroupId": "triceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "chest",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.55"
    },
    {
      "exerciseId": "seed_Barbell_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Curl",
      "muscleGroupId": "biceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Curl",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Curls_Lying_Against_An_Incline",
      "muscleGroupId": "biceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Full_Squat",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Full_Squat",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.70"
    },
    {
      "exerciseId": "seed_Barbell_Full_Squat",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.35"
    },
    {
      "exerciseId": "seed_Barbell_Full_Squat",
      "muscleGroupId": "lower_back",
      "role": "secondary",
      "weightFactor": "0.25"
    },
    {
      "exerciseId": "seed_Barbell_Full_Squat",
      "muscleGroupId": "quads",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Glute_Bridge",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Glute_Bridge",
      "muscleGroupId": "glutes",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Glute_Bridge",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Guillotine_Bench_Press",
      "muscleGroupId": "chest",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Guillotine_Bench_Press",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.55"
    },
    {
      "exerciseId": "seed_Barbell_Guillotine_Bench_Press",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Guillotine_Bench_Press",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Guillotine_Bench_Press",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Hack_Squat",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Hack_Squat",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Hack_Squat",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.35"
    },
    {
      "exerciseId": "seed_Barbell_Hack_Squat",
      "muscleGroupId": "quads",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Hip_Thrust",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Hip_Thrust",
      "muscleGroupId": "glutes",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Hip_Thrust",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.40"
    },
    {
      "exerciseId": "seed_Barbell_Incline_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "chest",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Barbell_Incline_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.55"
    },
    {
      "exerciseId": "seed_Barbell_Incline_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Incline_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Incline_Bench_Press_-_Medium_Grip",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Lunge",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Barbell_Lunge",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.75"
    },
    {
      "exerciseId": "seed_Barbell_Lunge",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.35"
    },
    {
      "exerciseId": "seed_Barbell_Lunge",
      "muscleGroupId": "quads",
      "role": "primary",
      "weightFactor": "0.90"
    },
    {
      "exerciseId": "seed_Behind_Head_Chest_Stretch",
      "muscleGroupId": "chest",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Behind_Head_Chest_Stretch",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Behind_Head_Chest_Stretch",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Behind_Head_Chest_Stretch",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Dips",
      "muscleGroupId": "chest",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Dips",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Dips",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Dips",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Dips",
      "muscleGroupId": "triceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Bench_Press_-_Powerlifting",
      "muscleGroupId": "chest",
      "role": "secondary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Bench_Press_-_Powerlifting",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Press_-_Powerlifting",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.55"
    },
    {
      "exerciseId": "seed_Bench_Press_-_Powerlifting",
      "muscleGroupId": "lats",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Press_-_Powerlifting",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Press_-_Powerlifting",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Press_-_Powerlifting",
      "muscleGroupId": "triceps",
      "role": "primary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Press_with_Chains",
      "muscleGroupId": "chest",
      "role": "secondary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Bench_Press_with_Chains",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.55"
    },
    {
      "exerciseId": "seed_Bench_Press_with_Chains",
      "muscleGroupId": "lats",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Press_with_Chains",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Press_with_Chains",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bench_Press_with_Chains",
      "muscleGroupId": "triceps",
      "role": "primary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bent-Arm_Barbell_Pullover",
      "muscleGroupId": "chest",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bent-Arm_Barbell_Pullover",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bent-Arm_Barbell_Pullover",
      "muscleGroupId": "lats",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Bent-Arm_Barbell_Pullover",
      "muscleGroupId": "lats",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bent-Arm_Barbell_Pullover",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bent-Arm_Barbell_Pullover",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Bent-Arm_Barbell_Pullover",
      "muscleGroupId": "triceps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Board_Press",
      "muscleGroupId": "chest",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Board_Press",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Board_Press",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Board_Press",
      "muscleGroupId": "lats",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Board_Press",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Board_Press",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Board_Press",
      "muscleGroupId": "triceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Body-Up",
      "muscleGroupId": "abs",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Body-Up",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Body-Up",
      "muscleGroupId": "triceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Box_Jump_Multiple_Response",
      "muscleGroupId": "abductors",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Jump_Multiple_Response",
      "muscleGroupId": "adductors",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Jump_Multiple_Response",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Jump_Multiple_Response",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Jump_Multiple_Response",
      "muscleGroupId": "hamstrings",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Box_Jump_Multiple_Response",
      "muscleGroupId": "quads",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Skip",
      "muscleGroupId": "abductors",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Skip",
      "muscleGroupId": "adductors",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Skip",
      "muscleGroupId": "calves",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Skip",
      "muscleGroupId": "glutes",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Box_Skip",
      "muscleGroupId": "hamstrings",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Box_Skip",
      "muscleGroupId": "quads",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Brachialis-SMR",
      "muscleGroupId": "biceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Butt_Lift_Bridge",
      "muscleGroupId": "glutes",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Butt_Lift_Bridge",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Cable_Hammer_Curls_-_Rope_Attachment",
      "muscleGroupId": "biceps",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Cable_Incline_Pushdown",
      "muscleGroupId": "lats",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Cable_Seated_Lateral_Raise",
      "muscleGroupId": "side_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Cable_Seated_Lateral_Raise",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Cable_Seated_Lateral_Raise",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Catch_and_Overhead_Throw",
      "muscleGroupId": "abs",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Catch_and_Overhead_Throw",
      "muscleGroupId": "chest",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Catch_and_Overhead_Throw",
      "muscleGroupId": "front_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Catch_and_Overhead_Throw",
      "muscleGroupId": "lats",
      "role": "primary",
      "weightFactor": "0.90"
    },
    {
      "exerciseId": "seed_Catch_and_Overhead_Throw",
      "muscleGroupId": "rear_delts",
      "role": "secondary",
      "weightFactor": "0.45"
    },
    {
      "exerciseId": "seed_Catch_and_Overhead_Throw",
      "muscleGroupId": "side_delts",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Chair_Lower_Back_Stretch",
      "muscleGroupId": "lats",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Chair_Lower_Back_Stretch",
      "muscleGroupId": "lower_back",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Chin-Up",
      "muscleGroupId": "biceps",
      "role": "secondary",
      "weightFactor": "0.55"
    },
    {
      "exerciseId": "seed_Chin-Up",
      "muscleGroupId": "forearms",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Chin-Up",
      "muscleGroupId": "lats",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Chin-Up",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.35"
    },
    {
      "exerciseId": "seed_Downward_Facing_Balance",
      "muscleGroupId": "abs",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Downward_Facing_Balance",
      "muscleGroupId": "glutes",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Downward_Facing_Balance",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Dumbbell_Lying_One-Arm_Rear_Lateral_Raise",
      "muscleGroupId": "side_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Dumbbell_Lying_One-Arm_Rear_Lateral_Raise",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Dumbbell_Lying_Rear_Lateral_Raise",
      "muscleGroupId": "side_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Dumbbell_One-Arm_Upright_Row",
      "muscleGroupId": "biceps",
      "role": "secondary",
      "weightFactor": "0.30"
    },
    {
      "exerciseId": "seed_Dumbbell_One-Arm_Upright_Row",
      "muscleGroupId": "side_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Dumbbell_One-Arm_Upright_Row",
      "muscleGroupId": "upper_back_traps",
      "role": "secondary",
      "weightFactor": "0.40"
    },
    {
      "exerciseId": "seed_Flutter_Kicks",
      "muscleGroupId": "glutes",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Flutter_Kicks",
      "muscleGroupId": "hamstrings",
      "role": "secondary",
      "weightFactor": "0.50"
    },
    {
      "exerciseId": "seed_Lateral_Raise_-_With_Bands",
      "muscleGroupId": "side_delts",
      "role": "primary",
      "weightFactor": "1.00"
    },
    {
      "exerciseId": "seed_Lying_One-Arm_Lateral_Raise",
      "muscleGroupId": "side_delts",
      "role": "primary",
      "weightFactor": "1.00"
    }
  ]
};
