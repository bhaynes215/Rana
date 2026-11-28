// The questionnaire: the 15 questions, in order, written once. The
// questionnaire screen renders them and (later) the Profile screen's "Your
// answers" list edits them, so a question's wording, options and rules never
// exist in two places.
//
// Each question:
//   id, field    the question's name, and the profile field its answer is saved to
//   type         "text" | "number" | "single" | "multi" | "days" | "weekdays" | "lifts"
//   pose         which Rana drawing asks it (wave, think, neutral, cheer)
//   prompt(a)    what Rana says; `a` is the answers so far (his words after the first
//                question use the name)
//   label        the field's label (Profile screen, number/text boxes)
//   options      [{ value, label, description }] for the choice types
//   unit, min, max, optional, placeholder   for number and text boxes
//   footnote     a quiet line under the answers
//   skipIf(a)    true if this question should not be asked, given the answers so far
//   validate(v, a)  an error message that says how to fix it, or null
//
// The words are Rana's (docs/redesign/PLAN.md §11). Change them here.

window.Rana = window.Rana || {};

Rana.questions = (() => {
  // A number box's rule: whole numbers between min and max.
  const numberRule = (min, max, message) => (value) => {
    const n = Number(value);
    return value !== "" && value !== null && value !== undefined && n >= min && n <= max ? null : message;
  };
  const pickOne = () => "Pick one.";

  const WEEKDAYS = [
    { value: "Mon", label: "Monday" },
    { value: "Tue", label: "Tuesday" },
    { value: "Wed", label: "Wednesday" },
    { value: "Thu", label: "Thursday" },
    { value: "Fri", label: "Friday" },
    { value: "Sat", label: "Saturday" },
    { value: "Sun", label: "Sunday" },
  ];

  const LEVEL_PHRASE = {
    "never-trained": "lifters who are new to training",
    "returning": "lifters getting back into training",
    "consistently": "lifters who train consistently",
  };

  // [3, 4] -> "3 or 4"
  const orList = (numbers) => numbers.join(" or ");

  const list = [
    {
      id: "name", field: "name", type: "text", pose: "wave",
      prompt: () => "Hey, I'm Rana. I'll be your coach. What should I call you?",
      label: "Your name", placeholder: "Your name", autocomplete: "given-name",
      validate: (v) => (v && String(v).trim() ? null : "Let me know what to call you."),
    },
    {
      id: "gender", field: "gender", type: "single", pose: "neutral",
      prompt: (a) => `Nice to meet you, ${a.name}. Which fits you? I use it for your calorie targets.`,
      label: "Gender",
      options: [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
        { value: "prefer-not-to-say", label: "Prefer not to say" },
      ],
      validate: (v) => (v ? null : pickOne()),
    },
    {
      id: "age", field: "age", type: "number", pose: "neutral",
      prompt: () => "How old are you?",
      label: "Age", min: 13, max: 100,
      validate: numberRule(13, 100, "Enter an age between 13 and 100."),
    },
    {
      id: "height", field: "height", type: "number", pose: "neutral",
      prompt: () => "How tall are you?",
      label: "Height", unit: "cm", min: 120, max: 230,
      validate: numberRule(120, 230, "Enter a height between 120 and 230 cm."),
    },
    {
      id: "weight_current", field: "weight_current", type: "number", pose: "neutral",
      prompt: () => "What do you weigh right now? A rough number is fine.",
      label: "Current weight", unit: "lb", min: 70, max: 500,
      validate: numberRule(70, 500, "Enter a weight between 70 and 500 lb."),
    },
    {
      id: "weight_target", field: "weight_target", type: "number", pose: "think", optional: true,
      prompt: () => "Got a weight you're aiming for? Skip this if not.",
      label: "Target weight", unit: "lb", min: 70, max: 500,
      validate: (v) => (v === "" || v === null || v === undefined ? null : numberRule(70, 500, "Enter a weight between 70 and 500 lb.")(v)),
    },
    {
      id: "goal", field: "goal", type: "single", pose: "wave",
      prompt: (a) => `Okay ${a.name}, the big one. What are you training for right now?`,
      label: "Main goal",
      options: [
        { value: "build-muscle", label: "Build muscle", description: "Add size and definition" },
        { value: "lose-fat", label: "Lose fat", description: "Lean out and keep your strength" },
        { value: "get-stronger", label: "Get stronger", description: "Move more weight on the big lifts" },
        { value: "general-fitness", label: "General fitness", description: "Feel good and stay consistent" },
      ],
      footnote: "You can change this later in Profile.",
      validate: (v) => (v ? null : pickOne()),
    },
    {
      id: "focus_area", field: "focus_area", type: "single", pose: "think",
      prompt: () => "Anything you most want to bring up?",
      label: "Focus area",
      options: [
        { value: "chest-arms", label: "Chest & arms", description: "Bigger press, fuller arms" },
        { value: "back-shoulders", label: "Back & shoulders", description: "Wider back, rounder shoulders" },
        { value: "legs-glutes", label: "Legs & glutes", description: "Stronger, bigger lower body" },
        { value: "balanced", label: "Balanced", description: "A bit of everything" },
      ],
      validate: (v) => (v ? null : pickOne()),
    },
    {
      id: "fitness_level", field: "fitness_level", type: "single", pose: "think",
      prompt: () => "Be honest with me. How much have you lifted before?",
      label: "Fitness level",
      options: [
        { value: "never-trained", label: "Never trained", description: "New to the weight room" },
        { value: "returning", label: "Trained before, returning", description: "Lifted before, getting back into it" },
        { value: "consistently", label: "Training consistently", description: "Lifting regularly right now" },
      ],
      validate: (v) => (v ? null : pickOne()),
    },
    {
      id: "activity_level", field: "activity_level", type: "single", pose: "neutral",
      prompt: () => "Outside the gym, how much are you on your feet?",
      label: "Activity outside the gym",
      options: [
        { value: "mostly-sitting", label: "Mostly sitting", description: "Classes, desk, screens" },
        { value: "moderately-active", label: "Moderately active", description: "Walking around campus most days" },
        { value: "on-feet-all-day", label: "On my feet all day", description: "A job or sport keeps me moving" },
      ],
      validate: (v) => (v ? null : pickOne()),
    },
    {
      id: "limitations", field: "limitations", type: "multi", pose: "think",
      prompt: () => "Anything that hurts that I should work around? I'll pick exercises that go easy on it.",
      label: "Limitations", exclusive: "none",
      options: [
        { value: "knee", label: "Knee" },
        { value: "shoulder", label: "Shoulder" },
        { value: "lower-back", label: "Lower back" },
        { value: "wrist", label: "Wrist" },
        { value: "none", label: "None of these" },
      ],
      validate: (v) => (v && v.length ? null : 'Pick at least one, or "None of these".'),
    },
    {
      id: "gym_type", field: "gym_type", type: "single", pose: "neutral",
      prompt: () => "Where do you usually train? Any of these works. Every exercise has swaps.",
      label: "Where you train",
      options: [
        { value: "rec-center", label: "Rec center", description: "Your campus gym" },
        { value: "commercial-gym", label: "Commercial gym", description: "A chain or local gym" },
        { value: "apartment-gym", label: "Apartment gym", description: "A small gym where you live" },
      ],
      validate: (v) => (v ? null : pickOne()),
    },
    {
      id: "days", field: "training_days_per_week", type: "days", pose: "think",
      prompt: () => "How many days a week can you actually get to the gym?",
      label: "Training days per week",
      options: [3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n), unit: "days" })),
      // The line under the tiles, built from the fitness level answered earlier.
      helper: (a) => {
        const recommended = (Rana.plan.RECOMMENDED_DAYS[a.fitness_level] || []);
        const who = LEVEL_PHRASE[a.fitness_level] || "most lifters";
        return `${orList(recommended)} days suits ${who}. Pick what fits around your classes; any option works.`;
      },
      validate: (v) => (v ? null : pickOne()),
    },
    {
      id: "weekdays", field: "training_weekdays", type: "weekdays", pose: "think",
      prompt: (a) => `Which ${a.training_days_per_week} days work best around your classes?`,
      label: "Training weekdays",
      options: WEEKDAYS,
      validate: (v, a) => {
        const wanted = Number(a.training_days_per_week);
        const picked = (v || []).length;
        return picked === wanted ? null : `Pick exactly ${wanted} days. You picked ${picked}.`;
      },
    },
    {
      // Asked once per main lift of the plan Rana is about to pick; the screen
      // writes the prompt for each lift (it needs the lift's name).
      id: "lifts", field: "starting_lifts", type: "lifts", pose: "neutral",
      label: "Starting lifts",
      skipIf: (a) => a.fitness_level === "never-trained", // new lifters start from their first logged sessions
    },
  ];

  const byId = (id) => list.find((q) => q.id === id);

  // The questions that will actually be asked, given the answers so far.
  function active(answers) {
    return list.filter((q) => !(q.skipIf && q.skipIf(answers)));
  }

  // "Barbell Incline Bench Press" -> "incline bench press": how Rana says a
  // lift in a sentence.
  function liftName(exercise) {
    return exercise.exercise_name.replace(/^Barbell /, "").toLowerCase();
  }

  // The same, starting with a capital: "Incline bench press" (a chip label).
  function liftLabel(exercise) {
    const name = liftName(exercise);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // The questionnaire's answers as a saved profile: real numbers, "None of
  // these" stored as no limitations, and a creation time. `answers.starting_lifts`
  // keeps only { weight, reps } or { skipped: true } per lift.
  function toProfile(answers) {
    const number = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
    return {
      name: String(answers.name || "").trim(),
      gender: answers.gender,
      age: number(answers.age),
      height: number(answers.height),
      weight_current: number(answers.weight_current),
      weight_target: number(answers.weight_target),
      goal: answers.goal,
      focus_area: answers.focus_area,
      fitness_level: answers.fitness_level,
      activity_level: answers.activity_level,
      // Where they train. Saved only: it does not change the plan (every
      // exercise has swap options instead).
      gym_type: answers.gym_type,
      limitations: (answers.limitations || []).filter((l) => l !== "none"),
      training_days_per_week: number(answers.training_days_per_week),
      training_weekdays: [...(answers.training_weekdays || [])],
      starting_lifts: answers.starting_lifts || {},
      created_at: new Date().toISOString(),
    };
  }

  return { list, byId, active, liftName, liftLabel, toProfile, WEEKDAYS };
})();
