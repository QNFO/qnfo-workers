// q08-mind — mind.q08.org
// A reading list for the inside. Primary sources, one question each, and a probe.
// Binding-free: no D1/KV/R2/AI/service bindings, no outbound fetches, no client JS.

const VERSION = "1.0.0-mind-1";
const BUILT = "2026-10-21";
const ORIGIN = "https://mind.q08.org";

const SHELVES = [
  { id: "attention", title: "Attention", line: "What your mind does when nothing is demanded of it." },
  { id: "self", title: "The self-model", line: "Is there a you behind the reports?" },
  { id: "affect", title: "Feeling and the body", line: "Where a mood comes from before you name it." },
  { id: "will", title: "Will, habit, and the limits of character", line: "Why knowing better is not doing better." },
  { id: "meaning", title: "Meaning and work", line: "What makes a life add up, argued rather than asserted." },
  { id: "practice", title: "Self-examination as a technique", line: "How to inspect your own mind without a guru." },
  { id: "failure", title: "Minds under failure, minds from inside", line: "What breaks, and what first-person accounts show." },
  { id: "measure", title: "Instruments", line: "Validated ways to put numbers on yourself." }
];

const ENTRIES = [
  // ---------------- attention ----------------
  {
    s: "james-attention", sh: "attention",
    q: "How much of what you experience did you actually choose to notice?",
    a: "William James", w: "The Principles of Psychology, ch. XI", y: "1890", k: "primary text",
    g: `Attention is the mind taking possession of one of several simultaneously possible objects. James's claim is that experience is not given but selected: my experience is what I agree to attend to. What you call your personality is partly a settled pattern of what you notice and what you let pass.`,
    p: `For one hour, every time your attention moves, write one line: what pulled it, something outside or a thought of your own.`,
    l: "https://plato.stanford.edu/entries/attention/", n: "smallwood-schooler"
  },
  {
    s: "smallwood-schooler", sh: "attention",
    q: "What is your mind doing when it leaves the room?",
    a: "Jonathan Smallwood and Jonathan Schooler", w: "The Science of Mind Wandering, Annual Review of Psychology 66", y: "2015", k: "review",
    g: `Mind-wandering is not a lapse but a large share of waking thought: self-generated, often future-directed, and only partly under control. The review separates deliberate from involuntary wandering, which matters. Deliberate wandering is where planning and writing happen. Involuntary wandering is where rumination lives.`,
    p: `Three alarms a day for three days. At each, label the last five minutes: on task, deliberately elsewhere, or hijacked.`,
    l: "https://openlibrary.org/search?q=smallwood+schooler+science+of+mind+wandering", n: "killingsworth-gilbert"
  },
  {
    s: "killingsworth-gilbert", sh: "attention",
    q: "Is an unhappy mind a wandering mind, or the reverse?",
    a: "Matthew Killingsworth and Daniel Gilbert", w: "A Wandering Mind Is an Unhappy Mind, Science 330", y: "2010", k: "empirical paper",
    g: `Experience sampling from about 2,250 adults: people mind-wander in nearly half of sampled moments, and they are less happy when they do, including when the wandering is to pleasant topics. The temporal ordering suggests the wandering precedes the unhappiness rather than following it.`,
    p: `Compare your worst hours this week against your least demanding hours. If they coincide, the problem is not the work.`,
    l: "https://openlibrary.org/search?q=wandering+mind+unhappy+mind+killingsworth", n: "raichle-dmn"
  },
  {
    s: "raichle-dmn", sh: "attention",
    q: "What subject does your brain return to when nothing else claims it?",
    a: "Marcus Raichle and colleagues", w: "A Default Mode of Brain Function, PNAS 98", y: "2001", k: "empirical paper",
    g: `A set of regions is more active at rest than during task, and deactivates when a task begins. Later work tied the network to self-referential thought, remembering, and imagining. Its content is your mind's preferred subject, not your chosen one.`,
    p: `Notice what your mind returns to in the first ten seconds after a task ends. Write it down; that is the default, not the decision.`,
    l: "https://openlibrary.org/search?q=default+mode+of+brain+function+raichle", n: "csikszentmihalyi-flow"
  },
  {
    s: "csikszentmihalyi-flow", sh: "attention",
    q: "Why is passive leisure the least restorative part of the day?",
    a: "Mihaly Csikszentmihalyi", w: "Flow, from experience-sampling studies", y: "1990", k: "monograph",
    g: `The experience-sampling work found people report their highest engagement and best mood during demanding work and their lowest during passive leisure, the so-called paradox of work. Flow is the state where difficulty and skill are matched. It is a measurement finding, not a doctrine.`,
    p: `Compare what you say you want to do with what you were doing when you last lost track of time. Note the gap in hours, not in adjectives.`,
    l: "https://openlibrary.org/search?q=flow+csikszentmihalyi", n: "james-attention"
  },

  // ---------------- self ----------------
  {
    s: "hume-self", sh: "self",
    q: "Can you find the self you are so sure you have?",
    a: "David Hume", w: "A Treatise of Human Nature, I.iv.6", y: "1739", k: "primary text",
    g: `Hume looks for the self by introspection and finds only particular perceptions: heat, light, a thought, never a simple impression of a self. The self is a bundle, and the sense of continuity is produced by imagination and memory. The argument is empirical: it asks you to look, and to report what is actually there.`,
    p: `One minute of noticing, then write only what was present. Count how many items were you and how many were objects, sensations, or words.`,
    l: "https://plato.stanford.edu/entries/hume/", n: "james-self"
  },
  {
    s: "james-self", sh: "self",
    q: "What exactly is your self-esteem a ratio of?",
    a: "William James", w: "The Principles of Psychology, ch. X", y: "1890", k: "primary text",
    g: `James splits the self into the I, the thinker, and the Me, what is thought about: material, social, and spiritual. Self-esteem he defines as success divided by pretensions, so it can be raised by achievement or lowered by ambition. The formula makes self-regard a ratio you can inspect rather than a mood you endure.`,
    p: `Write your current pretensions in your work, then your actual success at them. Compute the ratio honestly; then change one term deliberately.`,
    l: "https://plato.stanford.edu/entries/james-william/", n: "parfit"
  },
  {
    s: "parfit", sh: "self",
    q: "How much of the person you were at twenty-two is still you?",
    a: "Derek Parfit", w: "Reasons and Persons, Part III", y: "1984", k: "monograph",
    g: `Parfit argues that personal identity is not what matters; what matters is psychological connectedness and continuity, which come in degrees. If he is right, will it be me has no sharp answer, and prudence becomes a question about how much you care about a future person who is partly you.`,
    p: `List five beliefs or commitments you held at twenty-two. For each, ask whether the person who held it would recognise you as the same person.`,
    l: "https://plato.stanford.edu/entries/personal-identity/", n: "metzinger"
  },
  {
    s: "metzinger", sh: "self",
    q: "Why does a representation feel like an owner?",
    a: "Thomas Metzinger", w: "The Ego Tunnel, after Being No One", y: "2009", k: "monograph",
    g: `The self is a model the brain builds of itself, and it is transparent: you see through it rather than at it, which is why it feels like an owner rather than a representation. There is no additional entity behind the model. This is the rigorous statement of a conclusion the mystics reached by other means and without the argument.`,
    p: `Name three facts about yourself your self-model cannot represent from the inside: your blind spot, your face as others see it, your own death.`,
    l: "https://openlibrary.org/search?q=ego+tunnel+metzinger", n: "dennett"
  },
  {
    s: "dennett", sh: "self",
    q: "What is left of you when the story is subtracted?",
    a: "Daniel Dennett", w: "The Self as a Center of Narrative Gravity", y: "1992", k: "essay",
    g: `A centre of gravity is not a thing but a useful abstraction that explains the behaviour of a system. Dennett proposes the self is the same kind of posit: a narrative centre that organises a body's history, real in its effects and not a thing in the head.`,
    p: `Write your life in two hundred words. Then list everything the narrative had to leave out to stay coherent.`,
    l: "https://openlibrary.org/search?q=self+as+a+center+of+narrative+gravity+dennett", n: "gazzaniga"
  },
  {
    s: "gazzaniga", sh: "self",
    q: "Are your reasons causes or press releases?",
    a: "Michael Gazzaniga", w: "split-brain studies; The Ethical Brain", y: "2005", k: "empirical programme",
    g: `In split-brain patients the left hemisphere produces confident explanations for actions initiated by processes it had no access to. Gazzaniga calls this the interpreter. The finding generalises: reasons are often generated after the act, and their fluency is not evidence of their accuracy.`,
    p: `Catch one explanation you gave today for a choice. Ask whether you had the reason before the choice or constructed it after.`,
    l: "https://openlibrary.org/search?q=ethical+brain+gazzaniga", n: "hume-self"
  },

  // ---------------- affect ----------------
  {
    s: "james-emotion", sh: "affect",
    q: "Do you run because you are afraid, or are you afraid because you run?",
    a: "William James", w: "What Is an Emotion?, Mind 9", y: "1884", k: "primary text",
    g: `James inverts the common sense: the bodily change comes first and the feeling is the perception of that change. We do not tremble because we are afraid; we are afraid because we tremble. The claim is that affect is information about the body, not a verdict about the world.`,
    p: `At the next strong reaction, find the body event before the label: chest, jaw, gut, hands. Write the event first, the emotion word second.`,
    l: "https://plato.stanford.edu/entries/emotion/", n: "damasio"
  },
  {
    s: "damasio", sh: "affect",
    q: "What happens to decision-making when feeling is removed?",
    a: "Antonio Damasio", w: "Descartes' Error; The Feeling of What Happens", y: "1994", k: "monograph",
    g: `Patients with ventromedial prefrontal damage can reason normally on tests and still cannot decide, because they no longer generate the bodily signals that mark options as good or bad. Emotion is part of rational choice, not an intrusion on it. The pure reasoner is a patient, not an ideal.`,
    p: `Take a decision you are stuck on. Ask what you would lose if you felt nothing about any option. The answer names what your feelings are doing.`,
    l: "https://openlibrary.org/search?q=descartes+error+damasio", n: "barrett"
  },
  {
    s: "barrett", sh: "affect",
    q: "Is anger a circuit that fires, or a category you learned?",
    a: "Lisa Feldman Barrett", w: "How Emotions Are Made", y: "2017", k: "monograph",
    g: `Emotions are not fixed circuits that fire; they are categorised predictions built from interoceptive signals plus learned concepts. What is universal is affect, valence and arousal, not the named emotions. This makes your emotion vocabulary a variable in your self-knowledge, not a fact about it.`,
    p: `For one day, record only valence, pleasant or unpleasant, and arousal, high or low, at four points. Do not name any emotion.`,
    l: "https://openlibrary.org/search?q=how+emotions+are+made+barrett", n: "seth"
  },
  {
    s: "seth", sh: "affect",
    q: "If perception is inference, what is the self inferring?",
    a: "Anil Seth", w: "Being You", y: "2021", k: "monograph",
    g: `Perception is controlled hallucination, corrected by sensory prediction error, and the self is a prediction about the body's regulation rather than a thing perceived. The account is predictive-processing based and makes the self a process with a function: keeping the organism viable.`,
    p: `Find one place today where you perceived what you expected rather than what was there. Reading a familiar word wrong is enough.`,
    l: "https://openlibrary.org/search?q=being+you+seth", n: "james-emotion"
  },

  // ---------------- will ----------------
  {
    s: "aristotle-hexis", sh: "will",
    q: "If insight does not change you, what does?",
    a: "Aristotle", w: "Nicomachean Ethics, II.1-4", y: "c. 340 BCE", k: "primary text",
    g: `Virtues are hexeis, stable dispositions produced by repeated activity, the way a builder becomes a builder by building. Knowing the good is not the mechanism; practice is. Character is therefore an engineering problem about repeated acts, not a matter of insight.`,
    p: `Name one disposition you want. Write the smallest repeated act that would produce it, and how often you would have to do it.`,
    l: "https://plato.stanford.edu/entries/aristotle-ethics/", n: "frankfurt"
  },
  {
    s: "frankfurt", sh: "will",
    q: "Which of your desires do you want to have?",
    a: "Harry Frankfurt", w: "Freedom of the Will and the Concept of a Person, Journal of Philosophy 68", y: "1971", k: "paper",
    g: `What distinguishes a person is not reason but second-order desire: wanting to want something, or wanting not to. Freedom of the will is the alignment of the will you act on with the will you want to have. Addiction is the case where the two come apart.`,
    p: `Pick one first-order desire active today. State your second-order stance on it. If there is a gap, that gap is where the problem lives.`,
    l: "https://plato.stanford.edu/entries/frankfurt/", n: "doris"
  },
  {
    s: "doris", sh: "will",
    q: "How much of your character is just the room you are standing in?",
    a: "John Doris", w: "Lack of Character", y: "2002", k: "monograph",
    g: `Situationist social psychology found behaviour is predicted better by immediate circumstances than by global traits: the same person is honest, cruel, or helpful depending on noise, hurry, and who else is present. The strong reading is that character traits as usually conceived do not exist; the weak reading is that they are far more situational than we report.`,
    p: `Take one I am the kind of person who claim. Find the situations where it fails. Then change the situations rather than the self-description.`,
    l: "https://openlibrary.org/search?q=lack+of+character+doris", n: "osc-2015"
  },
  {
    s: "osc-2015", sh: "will",
    q: "How much of what you believe about your mind would survive a replication?",
    a: "Open Science Collaboration", w: "Estimating the Reproducibility of Psychological Science, Science 349", y: "2015", k: "empirical paper",
    g: `Of one hundred replication attempts of published psychology findings, thirty-six per cent produced significant results against ninety-seven per cent in the originals, and effect sizes roughly halved. Social priming and self-report effects were the weakest. Any theory of yourself built on a single study is probably built on sand.`,
    p: `Before adopting a claim about your mind, check whether it replicated. If you cannot find a replication, treat it as a hypothesis about you, not a fact.`,
    l: "https://openlibrary.org/search?q=estimating+reproducibility+psychological+science", n: "wolf"
  },

  // ---------------- meaning ----------------
  {
    s: "wolf", sh: "meaning",
    q: "Why can a pleasant life still feel empty?",
    a: "Susan Wolf", w: "Meaning in Life and Why It Matters", y: "2010", k: "monograph",
    g: `Meaning requires both active engagement and objective worth: you must be gripped by something, and the thing must merit being gripped. Neither satisfaction alone nor worth alone is enough, which is why a pleasant life can feel empty and a worthy one can feel dead.`,
    p: `List your current projects. Mark each on engagement and on worth, nought to five. The quadrant with high worth and low engagement is your debt.`,
    l: "https://plato.stanford.edu/entries/meaning-of-life/", n: "nagel"
  },
  {
    s: "nagel", sh: "meaning",
    q: "What do you do with the fact that your seriousness is optional?",
    a: "Thomas Nagel", w: "The Absurd", y: "1971", k: "essay",
    g: `Absurdity arises when we take our lives seriously and can also step back and see that seriousness as arbitrary. Nagel argues this is not a problem to solve but a structural feature of self-consciousness, to be met with irony rather than despair or faith.`,
    p: `Write the strongest case against your most important project, at full strength, as if you believed it. Then note what survives.`,
    l: "https://plato.stanford.edu/entries/meaning-of-life/", n: "williams"
  },
  {
    s: "williams", sh: "meaning",
    q: "Would an unlimited life still be worth living?",
    a: "Bernard Williams", w: "The Makropulos Case: Reflections on the Tedium of Immortality", y: "1973", k: "essay",
    g: `An indefinitely long life would eventually exhaust every categorical desire, leaving only conditional ones, and a life with nothing desired for its own sake is not worth living. Meaning depends on finitude: death is what makes your projects urgent rather than optional.`,
    p: `Name the desires you would still have if you had unlimited time. Those are your categorical desires; they are what your life is actually about.`,
    l: "https://openlibrary.org/search?q=makropulos+case+williams", n: "arendt"
  },
  {
    s: "arendt", sh: "meaning",
    q: "Which of the three things you do all week is not being expressed?",
    a: "Hannah Arendt", w: "The Human Condition", y: "1958", k: "monograph",
    g: `Arendt separates labour, cyclical and consumed, which keeps you alive; work, which makes durable objects that outlast the act; and action, speech and deed before others, where who you are appears. A life organised around one of the three is impoverished in the other two, and modern work tends to collapse all three into labour.`,
    p: `Sort last week's hours into labour, work, and action. Whichever is near zero is the part of you that is not being expressed.`,
    l: "https://openlibrary.org/search?q=human+condition+arendt", n: "montaigne"
  },

  // ---------------- practice ----------------
  {
    s: "montaigne", sh: "practice",
    q: "What do you actually think, before you have decided what to think?",
    a: "Michel de Montaigne", w: "Essays, III.13 Of Experience", y: "1580", k: "primary text",
    g: `The essays are an experiment in thinking on the page: Montaigne writes to find out what he thinks, revises as he goes, and refuses system. His subject is himself, and his method is honesty about inconsistency rather than coherence.`,
    p: `Write three hundred words with no thesis and no conclusion. Read it back and underline every claim you did not know you held.`,
    l: "https://openlibrary.org/search?q=montaigne+essays", n: "seneca"
  },
  {
    s: "seneca", sh: "practice",
    q: "What would a daily audit of your conduct actually look like?",
    a: "Seneca", w: "Letters to Lucilius, especially 1 and 28", y: "c. 65 CE", k: "primary text",
    g: `Seneca's letters are a technology for daily self-audit: review the day, name what went badly, and treat time as the one possession that cannot be replaced. The tone is not consolation but accounting.`,
    p: `Five minutes before sleep: what did I do badly, what well, what did I omit. Write it; do not resolve anything.`,
    l: "https://plato.stanford.edu/entries/stoicism/", n: "epictetus"
  },
  {
    s: "epictetus", sh: "practice",
    q: "How much of today's disturbance was about something you control?",
    a: "Epictetus", w: "Enchiridion", y: "c. 125 CE", k: "primary text",
    g: `The dichotomy of control: judgments and intentions are up to us, outcomes and other people's opinions are not. Disturbance comes from treating the second as if it were the first. This is the direct ancestor of cognitive behavioural therapy, and it is a procedure, not a mood.`,
    p: `Split today's worries into two columns: up to me, not up to me. Act only on the first column; note what the second costs you in attention.`,
    l: "https://plato.stanford.edu/entries/epictetus/", n: "hadot"
  },
  {
    s: "hadot", sh: "practice",
    q: "What if reading was supposed to change you rather than inform you?",
    a: "Pierre Hadot", w: "Philosophy as a Way of Life", y: "1981; English 1995", k: "monograph",
    g: `Ancient philosophy was a set of exercises, meditation, memorisation, self-scrutiny, the view from above, intended to transform the practitioner rather than to inform an audience. Reading was a practice. Doctrine was the justification for the practice, not its point.`,
    p: `Take one entry from this site and repeat its probe daily for seven days. Record what changes in the act, not in your opinion of it.`,
    l: "https://openlibrary.org/search?q=philosophy+as+a+way+of+life+hadot", n: "foucault"
  },
  {
    s: "foucault", sh: "practice",
    q: "Which self-examination techniques did you inherit without choosing?",
    a: "Michel Foucault", w: "Technologies of the Self", y: "1982 lectures", k: "lectures",
    g: `Self-care is a historical practice with techniques: letters to friends, journals, meditation, confession. The modern introspective self is one configuration among several, so which techniques you find natural is a fact about your era, not about human nature.`,
    p: `List the techniques you already use to examine yourself. Mark which came from school, work, therapy, or religion. Then try one you have never used.`,
    l: "https://plato.stanford.edu/entries/foucault/", n: "sacks"
  },

  // ---------------- failure ----------------
  {
    s: "sacks", sh: "failure",
    q: "Which capacity, if you lost it, would end the person you think you are?",
    a: "Oliver Sacks", w: "The Man Who Mistook His Wife for a Hat", y: "1985", k: "case studies",
    g: `Neurological patients lose capacities and rebuild selves around the loss: a man who cannot recognise faces, a woman who cannot feel her body, a man who cannot form new memories. The cases show identity as assembled and revisable rather than given.`,
    p: `Name the one capacity whose loss would end the person you think you are. Then ask how much of your week maintains it.`,
    l: "https://openlibrary.org/search?q=man+who+mistook+his+wife+for+a+hat", n: "jamison"
  },
  {
    s: "jamison", sh: "failure",
    q: "When has a state impersonated a conclusion?",
    a: "Kay Redfield Jamison", w: "An Unquiet Mind", y: "1995", k: "first-person",
    g: `A first-person account of bipolar illness by a clinician: the pull of mania, the loss of judgement inside it, the argument with medication over which self is authentic. It is the clearest available case study of how a state can impersonate a self.`,
    p: `Write down one state you have been in that you mistook for a conclusion about your life. Name the state separately from the conclusion.`,
    l: "https://openlibrary.org/search?q=an+unquiet+mind+jamison", n: "proust"
  },
  {
    s: "proust", sh: "failure",
    q: "Is your past continuous, or does it arrive in fragments?",
    a: "Marcel Proust", w: "In Search of Lost Time, Combray", y: "1913-1927", k: "literature",
    g: `Involuntary memory returns a past moment whole, triggered by a sensation rather than by will, and shows that the self is not continuous but resurrected in fragments. The narrator's project is to recover time that ordinary memory cannot reach.`,
    p: `Write one memory triggered by a sensory detail, a smell, a sound, a texture. Do not use chronology.`,
    l: "https://openlibrary.org/search?q=in+search+of+lost+time+proust", n: "dostoevsky"
  },
  {
    s: "dostoevsky", sh: "failure",
    q: "What does resistance to a correct explanation of yourself protect?",
    a: "Fyodor Dostoevsky", w: "Notes from Underground", y: "1864", k: "literature",
    g: `The Underground Man prefers self-laceration to being explained: he asserts that a man may choose what harms him precisely to prove he is not a piano key. It is the strongest literary warning against any system that claims to have modelled you completely.`,
    p: `Find one place where you resist a correct explanation of yourself. Note what the resistance protects.`,
    l: "https://openlibrary.org/search?q=notes+from+underground+dostoevsky", n: "ipip-neo"
  },

  // ---------------- measure ----------------
  {
    s: "ipip-neo", sh: "measure",
    q: "What do the five factors actually say, and what do they not say?",
    a: "Lewis Goldberg", w: "A Broad-Bandwidth, Public-Domain Personality Inventory, in Personality Psychology in Europe 7", y: "1999", k: "instrument",
    g: `The IPIP items are public domain and measure the Big Five with facet-level resolution. They are the non-proprietary alternative to commercial personality tests. The five factors are descriptive summaries of self-report, stable enough to be useful and not a theory of who you are.`,
    p: `Take a 120-item IPIP-NEO, then have one person who knows you well take the observer version. Compare; the gaps are the interesting data.`,
    l: "https://openlibrary.org/search?q=ipip+neo+goldberg+public+domain+personality", n: "nfc"
  },
  {
    s: "nfc", sh: "measure",
    q: "Do you seek effortful thinking, or only tolerate it?",
    a: "John Cacioppo and Richard Petty", w: "The Need for Cognition, Journal of Personality and Social Psychology 42", y: "1982", k: "instrument",
    g: `Need for cognition measures the extent to which a person seeks and enjoys effortful thinking, independent of intelligence. It predicts how you spend unstructured time and how you react to ambiguity.`,
    p: `Score the eighteen-item need-for-cognition scale. Then check whether your leisure actually matches the score.`,
    l: "https://openlibrary.org/search?q=need+for+cognition+cacioppo+petty", n: "ecr-r"
  },
  {
    s: "ecr-r", sh: "measure",
    q: "Under uncertainty, do you pursue or withdraw?",
    a: "R. Chris Fraley, Phillip Shaver and Kelly Brennan", w: "An Item Response Theory Analysis of Self-Report Measures of Adult Attachment, JPSP 78", y: "2000", k: "instrument",
    g: `Attachment anxiety and avoidance are measurable dimensions, not types; the ECR-R is the standard instrument. They predict how you behave when a relationship is uncertain, pursuit or withdrawal, and they are stable but not fixed.`,
    p: `Score the ECR-R. Recall your last three conflicts and check which dimension moved first.`,
    l: "https://openlibrary.org/search?q=ecr-r+adult+attachment+fraley", n: "aaq-ii"
  },
  {
    s: "aaq-ii", sh: "measure",
    q: "How much of your behaviour is organised around not feeling something?",
    a: "Frank Bond and colleagues", w: "Preliminary Psychometric Properties of the Acceptance and Action Questionnaire-II", y: "2011", k: "instrument",
    g: `Psychological flexibility, the capacity to act on values while unwanted thoughts and feelings are present, is one of the better-evidenced process variables in clinical psychology. The AAQ-II measures its inverse, experiential avoidance.`,
    p: `Score the AAQ-II. Then find one thing you avoided this week that you would have done if the feeling had not been there.`,
    l: "https://openlibrary.org/search?q=acceptance+and+action+questionnaire+II+bond", n: "james-attention"
  }
];

const BY_SLUG = new Map(ENTRIES.map(e => [e.s, e]));
const SHELF_BY_ID = new Map(SHELVES.map(s => [s.id, s]));
const START = ["james-attention", "hume-self", "james-emotion", "aristotle-hexis", "montaigne"];

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
:root{--paper:#fbfaf7;--ink:#191b1f;--muted:#6a6e76;--rule:#ddd8cd;--accent:#1f3a5f;--soft:#f2efe8}
@media (prefers-color-scheme:dark){:root{--paper:#111318;--ink:#e9e6df;--muted:#9a9ea7;--rule:#2c3038;--accent:#9db8d8;--soft:#191c22}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:18px/1.62 Charter,"Iowan Old Style",Georgia,"Times New Roman",serif}
.wrap{max-width:44rem;margin:0 auto;padding:0 1.25rem}
header{border-bottom:1px solid var(--rule);margin-bottom:2.5rem}
header .wrap{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;padding-top:1.1rem;padding-bottom:1.1rem;flex-wrap:wrap}
.brand{font:600 1.05rem/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:lowercase;color:var(--ink);text-decoration:none}
nav{display:flex;gap:1.1rem;flex-wrap:wrap}
nav a{font:400 .8rem/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-decoration:none}
nav a:hover,nav a:focus{color:var(--accent)}
h1{font-size:2.05rem;line-height:1.18;font-weight:600;margin:0 0 .9rem;letter-spacing:-.01em}
h2{font-size:1.22rem;line-height:1.3;font-weight:600;margin:2.6rem 0 .6rem}
h3{font:600 .74rem/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:2rem 0 .5rem}
p{margin:0 0 1.05rem}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:2px}
.lede{font-size:1.18rem;color:var(--ink);margin-bottom:1.4rem}
.dim{color:var(--muted)}
.small{font-size:.86rem;line-height:1.55}
ul.plain{list-style:none;margin:0;padding:0}
ul.plain li{padding:.72rem 0;border-top:1px solid var(--rule)}
ul.plain li:last-child{border-bottom:1px solid var(--rule)}
.q{display:block;font-size:1.02rem;line-height:1.4;text-decoration:none;color:var(--ink)}
.q:hover,.q:focus{color:var(--accent)}
.meta{font:400 .78rem/1.4 ui-sans-serif,system-ui,sans-serif;color:var(--muted);margin-top:.2rem}
.shelf-line{color:var(--muted);margin:-.3rem 0 1rem}
.entry-meta{font:400 .82rem/1.5 ui-sans-serif,system-ui,sans-serif;color:var(--muted);margin:0 0 1.6rem;padding-bottom:1.1rem;border-bottom:1px solid var(--rule)}
blockquote{margin:0 0 1.2rem;padding:.1rem 0 .1rem 1.1rem;border-left:2px solid var(--rule);color:var(--ink)}
.probe{background:var(--soft);padding:1.1rem 1.2rem;margin:0 0 1.4rem;border-radius:2px}
.probe h3{margin:0 0 .45rem}
.probe p{margin:0}
footer{border-top:1px solid var(--rule);margin-top:4rem;padding:1.4rem 0 3rem}
footer .small{color:var(--muted)}
.kicker{font:400 .76rem/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:.6rem}
table{width:100%;border-collapse:collapse;margin:0 0 1.4rem;font-size:.94rem}
th,td{text-align:left;vertical-align:top;padding:.55rem .6rem;border-top:1px solid var(--rule)}
th{font:600 .74rem/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
td:first-child{white-space:nowrap;font-family:ui-sans-serif,system-ui,sans-serif;font-size:.86rem}
@media (max-width:520px){body{font-size:17px}h1{font-size:1.72rem}td:first-child{white-space:normal}}
`;

function shell(title, desc, body, active) {
  const nav = [["/", "index"], ["/start", "start"], ["/method", "method"], ["/record", "record"], ["/random", "random"]]
    .map(([h, t]) => `<a href="${h}"${active === t ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}">
<meta name="color-scheme" content="light dark">
<style>${CSS}</style>
</head><body>
<header><div class="wrap"><a class="brand" href="/">mind</a><nav>${nav}</nav></div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap small">
<p>Primary sources only. Every claim is attributed to an author, a work and a year. Nothing here is a claim about you.</p>
<p>Corpus ${ENTRIES.length} entries, built ${BUILT}, worker ${VERSION}. <a href="/method">Inclusion criteria and exclusions</a>.</p>
</div></footer></body></html>`;
}

function entryRow(e) {
  const sh = SHELF_BY_ID.get(e.sh);
  return `<li><a class="q" href="/q/${e.s}">${esc(e.q)}</a>
<div class="meta">${esc(e.a)} &middot; ${esc(e.w)} &middot; ${e.y} &middot; ${esc(sh ? sh.title : e.sh)}</div></li>`;
}

function home() {
  const start = START.map(s => BY_SLUG.get(s)).filter(Boolean);
  const body = `
<p class="kicker">mind.q08.org</p>
<h1>A reading list for the inside.</h1>
<p class="lede">Thirty-six primary sources, each attached to one question about how a mind works, and each ending in a probe you can run on yourself in under an hour.</p>
<p>This is not a personality product. There are no types, no elements, no charts of your destiny, and no author here claims authority over your life. There are arguments that can be wrong, evidence that can fail to replicate, and exercises that either change what you notice or do not.</p>
<p class="dim small">If you want the shortest route: <a href="/start">five entries, in order</a>. If you want the reason for the exclusions: <a href="/method">method</a>.</p>

<h2>Start here</h2>
<ul class="plain">${start.map(entryRow).join("")}</ul>

${SHELVES.map(sh => {
    const list = ENTRIES.filter(e => e.sh === sh.id);
    return `<h2><a href="/s/${sh.id}" style="color:inherit;text-decoration:none">${esc(sh.title)}</a></h2>
<p class="shelf-line">${esc(sh.line)}</p>
<ul class="plain">${list.map(entryRow).join("")}</ul>`;
  }).join("")}

<h2>What this cannot do</h2>
<p>Reading does not measure you. The probes do, and only if you write down the result. The <a href="/record">record</a> page describes the smallest instrument worth keeping: four items, once a day, no streaks.</p>`;
  return shell("mind — a reading list for the inside", "Primary sources on attention, self, feeling, will, meaning, and self-examination, each with a probe.", body, "index");
}

function shelfPage(id) {
  const sh = SHELF_BY_ID.get(id);
  if (!sh) return null;
  const list = ENTRIES.filter(e => e.sh === id);
  const body = `<p class="kicker">Shelf</p><h1>${esc(sh.title)}</h1>
<p class="lede">${esc(sh.line)}</p>
<ul class="plain">${list.map(entryRow).join("")}</ul>
<p class="small dim"><a href="/">All shelves</a></p>`;
  return shell(`${sh.title} — mind`, sh.line, body, "");
}

function entryPage(slug) {
  const e = BY_SLUG.get(slug);
  if (!e) return null;
  const sh = SHELF_BY_ID.get(e.sh);
  const next = BY_SLUG.get(e.n);
  const body = `
<p class="kicker"><a href="/s/${e.sh}" style="color:inherit">${esc(sh ? sh.title : e.sh)}</a></p>
<h1>${esc(e.q)}</h1>
<p class="entry-meta">${esc(e.a)}. <em>${esc(e.w)}</em>. ${e.y}. ${esc(e.k)}.</p>

<h3>What it argues</h3>
<p>${esc(e.g)}</p>

<div class="probe"><h3>The probe</h3><p>${esc(e.p)}</p></div>

<h3>The source</h3>
<p class="small"><a href="${esc(e.l)}" rel="noopener noreferrer">${esc(e.w)}</a> &mdash; ${esc(e.a)}, ${e.y}. The link goes to the text or to a catalogue record for it, not to a summary.</p>

${next ? `<h3>Read next</h3><p><a href="/q/${next.s}">${esc(next.q)}</a><br><span class="meta">${esc(next.a)} &middot; ${next.y}</span></p>` : ""}
<p class="small dim"><a href="/">All shelves</a></p>`;
  return shell(`${e.q} — mind`, e.g.slice(0, 180), body, "");
}

function startPage() {
  const list = START.map(s => BY_SLUG.get(s)).filter(Boolean);
  const body = `<p class="kicker">Start</p><h1>Five entries, in order.</h1>
<p class="lede">About three hours of reading and four probes. The order matters: attention first, because everything else is built on what you notice.</p>
<ul class="plain">${list.map((e, i) => `<li><div class="meta">${i + 1}</div><a class="q" href="/q/${e.s}">${esc(e.q)}</a><div class="meta">${esc(e.a)} &middot; ${esc(e.w)} &middot; ${e.y}</div></li>`).join("")}</ul>
<p class="small dim">After the fifth, the useful question is which probe you would repeat for a week. That is <a href="/q/hadot">Hadot</a>.</p>`;
  return shell("Start — mind", "Five entries in order, with probes.", body, "start");
}

function methodPage() {
  const body = `<p class="kicker">Method</p><h1>Why this is not a personality system.</h1>
<p class="lede">The test for inclusion is not whether a claim feels true. It is whether the claim could be shown to be false, and whether the source is the person who made the argument.</p>

<h3>Inclusion criteria</h3>
<table><tbody>
<tr><td>1</td><td>A primary text or a peer-reviewed paper, not a summary of one.</td></tr>
<tr><td>2</td><td>The claim is stated so that evidence could contradict it.</td></tr>
<tr><td>3</td><td>Author, work and year are given, so the claim can be checked.</td></tr>
<tr><td>4</td><td>It yields a probe: something you can do that would test it on yourself.</td></tr>
<tr><td>5</td><td>It makes no claim about you in particular. The site describes minds, not your mind.</td></tr>
</tbody></table>

<h3>What is excluded, and why</h3>
<table><thead><tr><th>Excluded</th><th>Reason</th></tr></thead><tbody>
<tr><td>Astrology, tarot</td><td>No mechanism and no predictive content beyond vague description; unfalsifiable by construction.</td></tr>
<tr><td>MBTI and type systems</td><td>Forced dichotomies discard most of the variance. The five-factor model is continuous and predicts better; the type industry persists for other reasons.</td></tr>
<tr><td>Enneagram, Human Design, gene keys</td><td>Typologies with no peer-reviewed predictive record. Their appeal is narrative coherence, which is exactly the failure mode this site is meant to counter.</td></tr>
<tr><td>Manifestation and attraction</td><td>No mechanism. Any observed effect is better explained by attention, selection, and placebo.</td></tr>
<tr><td>Guru literature</td><td>Authority replaces argument. First-person testimony is included (Jamison) when it reports an experience rather than prescribing a life.</td></tr>
<tr><td>Stoicism as productivity</td><td>The ancient texts are included. The modern repackaging strips the exercises and keeps the brand.</td></tr>
<tr><td>Single-study self-help</td><td>Roughly a third of published psychology findings replicated in the 2015 Open Science Collaboration study, with halved effect sizes. One study is a hypothesis.</td></tr>
</tbody></table>

<h3>What the evidence is worth</h3>
<p>Philosophy is argument, not data: it can be valid and still not describe you. Psychology is data, often weak, often about groups rather than persons. Literature is neither, and is included because a first-person account can show a shape of experience that no study reports. Each entry names which kind it is, and the kinds are not interchangeable.</p>
<p class="small dim">Corrections are the point. If an entry misstates a source, the entry is wrong and should be fixed.</p>`;
  return shell("Method — mind", "Inclusion criteria, exclusions, and the evidence hierarchy.", body, "method");
}

function recordPage() {
  const body = `<p class="kicker">Record</p><h1>The smallest instrument worth keeping.</h1>
<p class="lede">Reading changes nothing by itself. Four items, once a day, sixty seconds. Anything longer stops being filled in, and a protocol you will actually run beats a validated one you will not.</p>

<table><thead><tr><th>Item</th><th>What it measures</th></tr></thead><tbody>
<tr><td>Hours slept</td><td>Affect regulation and next-day cognition. Almost every other reading is contaminated without it.</td></tr>
<tr><td>Valence, -2 to +2</td><td>Core affect, the ingredient Barrett's account says emotions are built from.</td></tr>
<tr><td>Load, 0 to 10</td><td>How much of the day was demanded by someone else. The autonomy term in self-determination theory.</td></tr>
<tr><td>One line: what you did that you would do again</td><td>Categorical desire, in Williams's sense: the part of the day you would repeat if you could.</td></tr>
</tbody></table>

<h3>Rules</h3>
<p>No streaks. No scores. No weekly average shown as a grade. Missing a day is data about the protocol, not about you. Once a month, read the four columns together and write one sentence: what changed. That sentence is the only output.</p>

<h3>Why four and not forty</h3>
<p>Sleep, affect, autonomy and repetition are the four variables that the rest of this corpus keeps returning to: James on what you attend to, Barrett on what affect is made of, Frankfurt on what you want to want, Wolf on engagement with something worth engaging. A forty-item inventory measures the author's theory. Four items measure whether you are living the week you think you are.</p>

<h3>Where it goes</h3>
<p class="small">This page has no form and stores nothing. The instrument belongs in your own record, on your own plane, not on a public page. Keep it wherever you keep private notes.</p>`;
  return shell("Record — mind", "A four-item daily self-record and the reasoning behind it.", body, "record");
}

function notFound() {
  const body = `<p class="kicker">404</p><h1>No entry at that address.</h1>
<p>There are ${ENTRIES.length} entries. <a href="/">The index</a> lists all of them by shelf.</p>`;
  return shell("Not found — mind", "No entry at that address.", body, "");
}

function feed() {
  const items = ENTRIES.slice(0, 24).map(e => `<item>
<title>${esc(e.q)}</title>
<link>${ORIGIN}/q/${e.s}</link>
<guid isPermaLink="true">${ORIGIN}/q/${e.s}</guid>
<description>${esc(e.a + ". " + e.w + ". " + e.y + ". " + e.g)}</description>
<pubDate>${new Date(BUILT + "T00:00:00Z").toUTCString()}</pubDate>
</item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>mind — a reading list for the inside</title>
<link>${ORIGIN}</link>
<description>Primary sources on attention, self, feeling, will, meaning, and self-examination.</description>
<language>en</language>
<lastBuildDate>${new Date(BUILT + "T00:00:00Z").toUTCString()}</lastBuildDate>
${items}
</channel></rss>`;
}

function sitemap() {
  const urls = ["/", "/start", "/method", "/record", ...SHELVES.map(s => "/s/" + s.id), ...ENTRIES.map(e => "/q/" + e.s)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${ORIGIN}${u}</loc><lastmod>${BUILT}</lastmod></url>`).join("\n")}
</urlset>`;
}

const html = (body, status = 200, cache = "public, max-age=300, s-maxage=3600") =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "q08-mind", version: VERSION, entries: ENTRIES.length, shelves: SHELVES.length, built: BUILT }), {
        headers: { "content-type": "application/json", "cache-control": "no-store" }
      });
    }

    if (path === "/api/entries.json") {
      return new Response(JSON.stringify({ ok: true, version: VERSION, shelves: SHELVES, entries: ENTRIES }, null, 1), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=3600" }
      });
    }

    if (path === "/feed.xml" || path === "/rss.xml") {
      return new Response(feed(), { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600, s-maxage=3600" } });
    }

    if (path === "/sitemap.xml") {
      return new Response(sitemap(), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }

    if (path === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }

    if (path === "/") return html(home());
    if (path === "/start") return html(startPage());
    if (path === "/method") return html(methodPage());
    if (path === "/record") return html(recordPage());

    if (path === "/random") {
      const e = ENTRIES[Math.floor(Math.random() * ENTRIES.length)];
      return Response.redirect(ORIGIN + "/q/" + e.s, 302);
    }

    if (path.startsWith("/s/")) {
      const page = shelfPage(decodeURIComponent(path.slice(3)));
      return page ? html(page) : html(notFound(), 404, "no-store");
    }

    if (path.startsWith("/q/")) {
      const page = entryPage(decodeURIComponent(path.slice(3)));
      return page ? html(page) : html(notFound(), 404, "no-store");
    }

    return html(notFound(), 404, "no-store");
  }
};
