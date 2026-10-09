/** Broad groups are used for set totals; parts describe expected exercise involvement. */
export const muscles = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'shins', 'core', 'rotator cuff'] as const;
export type MuscleGroup = typeof muscles[number];

// Keep useful training distinctions. Lats and spinal erectors are grouped because
// ordinary exercise selection does not reliably isolate their individual fibres.
export const musclePartDetails = {
  biceps_long_head: { label: 'Biceps · long head', group: 'biceps' },
  biceps_short_head: { label: 'Biceps · short head', group: 'biceps' },
  brachialis: { label: 'Brachialis', group: 'biceps' },
  brachioradialis: { label: 'Brachioradialis', group: 'forearms' },
  triceps_long_head: { label: 'Triceps · long head', group: 'triceps' },
  triceps_lateral_head: { label: 'Triceps · lateral head', group: 'triceps' },
  triceps_medial_head: { label: 'Triceps · medial head', group: 'triceps' },
  wrist_flexors: { label: 'Wrist flexors', group: 'forearms' },
  wrist_extensors: { label: 'Wrist extensors', group: 'forearms' },
  deltoid_anterior: { label: 'Deltoid · anterior (front)', group: 'shoulders' },
  deltoid_lateral: { label: 'Deltoid · lateral (side)', group: 'shoulders' },
  deltoid_posterior: { label: 'Deltoid · posterior (rear)', group: 'shoulders' },
  supraspinatus: { label: 'Supraspinatus', group: 'rotator cuff' },
  infraspinatus: { label: 'Infraspinatus', group: 'rotator cuff' },
  teres_minor: { label: 'Teres minor', group: 'rotator cuff' },
  subscapularis: { label: 'Subscapularis', group: 'rotator cuff' },
  pectoralis_clavicular: { label: 'Pectoralis major · clavicular (upper)', group: 'chest' },
  pectoralis_sternocostal: { label: 'Pectoralis major · sternocostal (mid/lower)', group: 'chest' },
  pectoralis_minor: { label: 'Pectoralis minor', group: 'chest' },
  latissimus_dorsi: { label: 'Latissimus dorsi', group: 'back' },
  trapezius_upper: { label: 'Trapezius · upper', group: 'back' },
  trapezius_middle: { label: 'Trapezius · middle', group: 'back' },
  trapezius_lower: { label: 'Trapezius · lower', group: 'back' },
  rhomboids: { label: 'Rhomboids', group: 'back' },
  teres_major: { label: 'Teres major', group: 'back' },
  erector_spinae: { label: 'Erector spinae', group: 'back' },
  rectus_femoris: { label: 'Rectus femoris', group: 'quads' },
  vastus_lateralis: { label: 'Vastus lateralis', group: 'quads' },
  vastus_medialis: { label: 'Vastus medialis', group: 'quads' },
  vastus_intermedius: { label: 'Vastus intermedius', group: 'quads' },
  biceps_femoris_long_head: { label: 'Biceps femoris · long head', group: 'hamstrings' },
  biceps_femoris_short_head: { label: 'Biceps femoris · short head', group: 'hamstrings' },
  semitendinosus: { label: 'Semitendinosus', group: 'hamstrings' },
  semimembranosus: { label: 'Semimembranosus', group: 'hamstrings' },
  gluteus_maximus: { label: 'Gluteus maximus', group: 'glutes' },
  gluteus_medius: { label: 'Gluteus medius', group: 'glutes' },
  gluteus_minimus: { label: 'Gluteus minimus', group: 'glutes' },
  adductor_magnus: { label: 'Adductor magnus', group: 'adductors' },
  adductor_longus: { label: 'Adductor longus', group: 'adductors' },
  adductor_brevis: { label: 'Adductor brevis', group: 'adductors' },
  gracilis: { label: 'Gracilis', group: 'adductors' },
  pectineus: { label: 'Pectineus', group: 'adductors' },
  gastrocnemius_medial_head: { label: 'Gastrocnemius · medial head', group: 'calves' },
  gastrocnemius_lateral_head: { label: 'Gastrocnemius · lateral head', group: 'calves' },
  soleus: { label: 'Soleus', group: 'calves' },
  tibialis_anterior: { label: 'Tibialis anterior', group: 'shins' },
  rectus_abdominis: { label: 'Rectus abdominis', group: 'core' },
  external_obliques: { label: 'External obliques', group: 'core' },
  internal_obliques: { label: 'Internal obliques', group: 'core' },
  transversus_abdominis: { label: 'Transversus abdominis', group: 'core' },
} as const satisfies Record<string, { label: string; group: MuscleGroup }>;

export type MusclePartId = keyof typeof musclePartDetails;
export const musclePartIds = Object.keys(musclePartDetails) as [MusclePartId, ...MusclePartId[]];
export const muscleParts = musclePartIds.map(id => ({ id, ...musclePartDetails[id] }));

/** Only normalize the old group label; never infer missing historical part data. */
export function normalizeMuscleGroup(muscle: MuscleGroup | 'anterior delt'): MuscleGroup {
  return muscle === 'anterior delt' ? 'shoulders' : muscle;
}
