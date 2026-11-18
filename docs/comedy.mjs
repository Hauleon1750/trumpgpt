import {displayText} from "./locale.mjs";

export const disclaimer = "Unofficial AI Satire. All answers are fictional.";

export const modes = {
  qa: {
    name: "Presidential Q&A", icon: "chat", description: "Ask the fictional president.",
    greeting: "The podium is mine, the microphone is on, and my notes appear to be a lunch menu. What's your question?",
    prompts: ["What's for lunch?", "How's the Wi-Fi?", "Any productivity tips?"],
    food: [
      "My economic model is a sandwich. If the middle gets squeezed, everybody notices, especially the fellow in the nice tie.",
      "Lunch has three courses. The first is soup, the second is a debate about soup, and the third is cold soup.",
      "I ordered a balanced breakfast. The chef put a pancake on each shoulder. Exceptional posture all morning."
    ],
    tech: [
      "The Wi-Fi has full bars in the broom closet. I've moved my desk in. The mop has seniority.",
      "I replaced my password with a stirring speech. Now even I can't get past the introduction.",
      "My printer asked for magenta to print a black tie. Frankly, it understands formalwear better than I do."
    ],
    work: [
      "I cut every meeting in half. We now hold twice as many, but the sandwiches are triangles.",
      "My productivity secret is a very small desk. Only one problem fits at a time.",
      "I wrote 'finish list' at the top of my to-do list. A bold start, structurally disastrous."
    ],
    general: [
      "Excellent question. I put it in my suggestion box, which is a hat. For the first time all week I have something on my mind.",
      "My advisers gave me two options. I asked for a third and they turned the paper sideways.",
      "Let me consult my cabinet. Top drawer says pencils. Bottom drawer says biscuits. A rare unanimous recommendation to take a break."
    ]
  },
  press: {
    name: "Press Conference", icon: "mic", description: "Take the reporter's seat.",
    greeting: "Front row, you're up. Please keep it to one question. The last reporter brought a trilogy.",
    prompts: ["Why the coffee shortage?", "Is the mic working?", "Time for a follow-up?"],
    food: [
      "The coffee shortage? Check the press badges. Six of those reporters are espresso machines in trench coats.",
      "You ask who leaked the soup menu. Look at the minutes. Every page has a little ring of tomato on it.",
      "The doughnut count is off the record. The powdered sugar on my lapel, regrettably, is in high definition."
    ],
    tech: [
      "Yes, the microphone works. It picked up my stomach growling and now the back row wants a quote from lunch.",
      "The teleprompter froze on 'pause for laughter.' That was Tuesday. I'm glad someone finally asked.",
      "That flashing light means the camera is recording, or the toaster has joined the press pool. Either way, good morning."
    ],
    work: [
      "One follow-up, please. Last time we allowed two, a question opened its own branch office.",
      "We scheduled this briefing down to the second. Unfortunately nobody wrote down which second.",
      "The minutes of the meeting are available. The hours are gone forever. I miss them too."
    ],
    general: [
      "Could you repeat the question into the other microphone? This one's been nodding along to everything.",
      "My source is close to the podium. Very close. It's a sticky note on the podium. In my handwriting.",
      "That concludes the short answer. The long answer is the same answer read while looking for my glasses."
    ]
  },
  crisis: {
    name: "White House Crisis", icon: "alarm", description: "Manage an absurd emergency.",
    greeting: "The situation room is open. Someone labeled the emergency binder 'miscellaneous.' What are we dealing with?",
    prompts: ["The fridge is empty!", "The printer is jammed!", "Too many meetings!"],
    food: [
      "The emergency fridge contains one olive. I've seated it at the head of the table until we establish its intentions.",
      "Our strategic biscuit reserve is mostly crumbs. Get me a spoon. This crisis just became a pudding.",
      "The kitchen ran out of forks. I have authorized spaghetti in sandwich form. Bring napkins and a structural engineer."
    ],
    tech: [
      "The printer swallowed the rescue plan. We've sent in a second sheet asking very politely for the first one back.",
      "The router is blinking like a tiny disco. Nobody touch it until the IT department finishes the chorus.",
      "Our backup computer is updating. Our backup backup is a pencil. Find the secretary of sharpening."
    ],
    work: [
      "The calendar is completely full. We've penciled in some breathing for the third Thursday of an imaginary month.",
      "Two committees booked the situation room at once. They're sharing one emergency until lunch.",
      "The agenda has grown an appendix. Quarantine it before it develops a slide deck."
    ],
    general: [
      "Bring me the red folder. That's the dessert menu. Leave it here and bring me the other red folder.",
      "Our emergency drill went perfectly until we discovered it was a cordless drill and the battery was flat.",
      "The panic button fell off. Everyone stay calm while I locate the smaller button for reporting button problems."
    ]
  }
};

const topics = [
  ["food", /\b(lunch|coffee|fridge|food|soup|kitchen|breakfast|pizza|dinner|sandwich|menu)\b|午餐|午饭|早饭|晚饭|早餐|晚餐|咖啡|冰箱|吃什么|食物|厨房|菜单|三明治|披萨|饼干|喝汤|汤品/i],
  ["tech", /\b(wi[ -]?fi|router|printer|mic|microphone|computer|tech|phone|password|internet)\b|无线网|网络|路由器|打印机|麦克风|话筒|电脑|技术|手机|密码|上网|信号/i],
  ["work", /\b(productivity|work|meetings?|office|calendar|follow[ -]?up|schedule|agenda)\b|效率|工作|开会|会议|办公室|办公|日程|日历|追问|议程|加班/i]
];

export function createResponder(random = Math.random) {
  const bags = new Map();
  return (mode, question) => {
    const topic = topics.find(([, pattern]) => pattern.test(question))?.[0] || "general";
    const key = mode + "/" + topic;
    const lines = modes[mode][topic];
    const state = bags.get(key) || { remaining: [], last: null };
    if (!state.remaining.length) state.remaining = [...lines];
    const options = state.remaining.filter(line => line !== state.last);
    const line = options[Math.floor(random() * options.length)];
    state.remaining.splice(state.remaining.indexOf(line), 1);
    state.last = line;
    bags.set(key, state);
    return line;
  };
}

export function replyLabel(provider) {
  return provider === "mock" ? "Mock reply" : "AI reply";
}

export function transcript(mode, messages, language = "en") {
  const turns = messages.map(({user, text, preset, translation, provider}) => {
    const label = displayText(provider ? replyLabel(provider) : user ? "Question" : "Fictional president", language);
    const body = displayText(text, language, "\n", !user || preset === true, translation);
    return label + (language === "zh" ? "：" : ": ") + body;
  });
  return ["TrumpGPT — " + displayText(disclaimer, language, "\n"),
    displayText(modes[mode].name, language), ...turns].join("\n\n");
}
