# Exercise target conventions

The catalog has 101 exercises, including `ex_step_up` (Step Ups). The original
39 IDs remain stable so existing routines continue to resolve. Exercise targets
describe expected involvement for the named variation; they are not measurements
of an individual's muscle activation, fatigue, effective volume, or growth.

## How to interpret the fields

- `primaryMuscle` and `secondaryMuscles` retain broad groups for navigation and
  group-level reporting. A target's `role` must agree with its broad group.
- `muscleTargets[].part` identifies a tracked muscle, anatomical head, or useful
  region. Not every part is literally a separate anatomical head.
- `emphasis: 'biased'` identifies a useful emphasis within the primary group.
  Other muscles still contribute. It does not mean isolation, a percentage of
  activation, or guaranteed extra hypertrophy.
- `emphasis: 'shared'` identifies meaningful involvement without asserting a
  selective emphasis. It does not mean that all listed muscles share equal load.
- `biasNotes` explain important technique assumptions and limits. For example,
  the hanging knee raise assumes a pelvic curl, and the Pallof press uses
  repetitions rather than an unmodelled hold duration.

No numerical allocation of a set across muscle parts is implied. One compound
set can involve several parts, so part counts must not be added together as a
total number of workout sets.

## Deliberate scope choices

Both biceps heads remain shared targets for curls. Shoulder and forearm position
can change loading, but the catalog does not turn common long-head/short-head
isolation claims into facts. Brachialis is included in the elbow-flexor bundle;
brachioradialis belongs to forearms, even though it also flexes the elbow.

The lats remain a single target. Erector spinae, rhomboids, wrist flexors and wrist
extensors are tracked as practical groups. Pectoralis minor exists in the
taxonomy but has no assigned catalog exercise: ordinary chest presses and flys
do not justify counting it as a specifically trained target. This omission is
intentional, rather than inferring deep-muscle work from every chest exercise.

The catalog distinguishes hip-extension hamstrings from knee-flexion hamstrings.
The biceps femoris short head is included in curls, not Romanian deadlifts or
other hip hinges. Squats and leg presses no longer advertise hamstrings as a
meaningful secondary training target. Their adductor contribution is represented
instead. Calves and tibialis anterior are separate groups.

Rotator cuff entries distinguish external rotation, internal rotation and
scaption. They are exercise classifications, not rehabilitation prescriptions.
Incidental stabilizers are generally omitted; meaningful stabilizing work such
as gluteus medius during unilateral leg exercises and abdominal bracing during
core exercises is represented as shared involvement.

## Evidence behind the main distinctions

These studies inform the model; extending a finding to similar equipment or
variants is an anatomical inference, not a claim that every catalog exercise
has been directly tested. EMG findings alone do not establish muscle growth.

- **Chest angle:** flat versus inclined pressing can shift regional pectoral
  excitation toward sternocostal versus clavicular regions. Both remain listed.
  Incline fly and machine/dumbbell variations use the same anatomical inference.
  [Cabral et al., 2022](https://pubmed.ncbi.nlm.nih.gov/34644424/).
- **Overhead triceps work:** a training comparison found greater triceps growth
  with the overhead position, including the long head and the combined other
  heads. The catalog emphasizes the lengthened long head while retaining shared
  lateral and medial head involvement.
  [Maeo et al., 2023](https://onlinelibrary.wiley.com/doi/abs/10.1080/17461391.2022.2100279).
- **Calf knee angle:** standing calf raises produced more gastrocnemius growth
  than seated raises, with similar soleus growth. Seated raises receive a
  *relative* soleus emphasis, not a claim of superior soleus hypertrophy. Neither
  variation isolates one gastrocnemius head.
  [Kinoshita et al., 2023](https://pubmed.ncbi.nlm.nih.gov/38156065/).
- **Squats and rectus femoris:** squat training produced growth in the vasti,
  gluteus maximus and adductors, with no significant rectus femoris or hamstring
  growth in this comparison. This informs the conservative squat targets and
  the value of direct knee extension for rectus femoris coverage.
  [Kubo et al., 2019](https://pubmed.ncbi.nlm.nih.gov/31230110/).
- **Hip extension versus knee flexion:** different hamstring recruitment was
  observed across the tasks. The catalog keeps their involvement separate
  without assigning an exclusive semitendinosus or biceps femoris bias.
  [Yanagisawa and Fukutani, 2020](https://pubmed.ncbi.nlm.nih.gov/32269647/).
- **Step-ups:** lower-limb EMG studies support quadriceps and glute involvement,
  with technique and load affecting contribution. The entry keeps these shared
  and does not claim selective vastus medialis training.
  [Muyor et al., 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7112217/),
  [glute activity comparison, 2014](https://pubmed.ncbi.nlm.nih.gov/25540706/).
- **Rotator cuff:** intramuscular EMG comparisons inform the external-rotation
  and scaption distinctions, while also showing contribution from adjacent
  shoulder muscles.
  [Reinold et al., 2004](https://pubmed.ncbi.nlm.nih.gov/15296366/),
  [supraspinatus exercise comparison, 2009](https://pubmed.ncbi.nlm.nih.gov/19812522/).
- **Pronated elbow flexion:** a hand-position comparison supports including a
  brachioradialis emphasis in reverse curls while retaining elbow-flexor
  assistance. It does not establish biceps head isolation.
  [Kleiber et al., 2015](https://pubmed.ncbi.nlm.nih.gov/26300781/).
