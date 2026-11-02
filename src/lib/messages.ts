export type Locale = "zh" | "en"

export type Messages = {
  nav: { publish: string; duty: string; mine: string }
  duty: {
    on: string
    off: string
    model: string
    unpublished: string
    working: string
    clockedOff: string
    clockOut: string
    clockIn: string
  }
  footer: string
  record: { completed: string; score: string; time: string; empty: string }
  copy: {
    loading: string
    copied: string
    discovery: string
    mcp: string
    mine: string
    person: string
    call: string
    callCopied: string
  }
  home: {
    title: string
    lead: string
    onDutyNow: string
    goOnDuty: string
    publish: string
    seeDuty: string
    step1Title: string
    step1Body: string
    step2Title: string
    step2Body: string
    step3Title: string
    step3Body: string
    dutyTitle: string
    people: (count: number) => string
    discoveryHint: string
    mcpHint: string
    rosterError: string
    loading: string
    empty: string
  }
  agents: {
    title: string
    lead: string
    discoveryHint: string
    mcpHint: string
    rosterError: string
    loading: string
    empty: string
  }
  profile: {
    forModels: string
    discoveryOn: string
    discoveryOff: string
    mcpHint: string
    send: string
    sample: string
    loadError: string
    opening: string
  }
  me: {
    noneTitle: string
    noneBody: string
    onBody: string
    offBody: string
    dutyError: string
    edit: string
    publicCard: string
    discoveryHint: string
    mcpHint: string
    tasks: string
    openTasks: (count: number) => string
    tasksError: string
    loading: string
    empty: string
  }
  publish: {
    edit: string
    create: string
    lead: string
    name: string
    bio: string
    bioPlaceholder: string
    legend: string
    skillName: string
    skillPlaceholder: string
    canDo: string
    canDoPlaceholder: string
    removeSkill: string
    addSkill: string
    duplicate: string
    writing: string
    save: string
    publish: string
    saveError: string
  }
  schema: {
    identifierHint: string
    input: string
    output: string
    addField: string
    emptyFields: string
    name: string
    namePlaceholder: string
    ariaName: (label: string) => string
    ariaType: (label: string) => string
    ariaNote: (label: string) => string
    type: string
    required: string
    remove: string
    note: string
    notePlaceholder: string
    inputJson: string
    outputJson: string
    cannotSplit: string
    useForm: string
    useJson: string
    line: (label: string, body: string) => string
  }
  notice: {
    title: string
    from: (name: string) => string
    dismiss: string
    open: string
  }
  task: {
    awaitingScore: string
    from: (name: string) => string
    gotScore: (score: number) => string
    scoredBy: (name: string, score: number) => string
    artifact: string
    handBack: (schema: string) => string
    image: string
    textOptional: string
    writeHere: string
    imageTooBig: string
    imageType: string
    needImage: string
    submitting: string
    submit: string
    needInput: string
    reject: string
    fail: string
    cancel: string
    inputPlaceholder: string
    rejectPlaceholder: string
    failPlaceholder: string
    cancelPlaceholder: string
    confirm: string
    statusUpdated: string
    statusError: string
    submitError: string
    opening: string
    loadError: string
    incomingAlt: string
    returnedAlt: string
    pendingAlt: string
    handedWaiting: string
  }
  output: {
    image: string
    submitting: string
    submit: string
    choose: string
    yes: string
    no: string
    skip: string
    jsonPlaceholder: string
    oneImage: string
    requiredSuffix: string
    noteColon: string
    mustFill: (label: string) => string
    mustBe: (label: string) => string
    fieldMustBe: (name: string, label: string) => string
  }
  status: { loading: string; retry: string }
}

export const zh = {
  nav: { publish: "发布", duty: "在岗", mine: "我的卡" },
  duty: {
    on: "在岗",
    off: "不在岗",
    model: "模型方",
    unpublished: "尚未发布",
    working: "上工中",
    clockedOff: "没上工",
    clockOut: "收工",
    clockIn: "上工",
  },
  footer: "人发布自己的卡。上工之后，模型按技能把任务派过来。",
  record: { completed: "完成", score: "平均分", time: "平均耗时", empty: "—" },
  copy: {
    loading: "加载中",
    copied: "已复制",
    discovery: "复制发现入口",
    mcp: "复制 MCP 备用入口",
    mine: "复制我的地址",
    person: "复制这个人的地址",
    call: "复制一条调用",
    callCopied: "已复制调用",
  },
  home: {
    title: "人的 agent card",
    lead: "发布一张符合 A2A 的卡。技能里写明你能完成什么。模型发现在岗的人，自己选一个，把任务派过来。",
    onDutyNow: "正在上工",
    goOnDuty: "去上工",
    publish: "发布我的卡",
    seeDuty: "看谁在岗",
    step1Title: "发布",
    step1Body: "自己写名字、简介，以及每项技能能完成什么。",
    step2Title: "上工",
    step2Body: "上工之后，你的卡才会出现在发现名单里。",
    step3Title: "被委派",
    step3Body: "模型读你的技能，把对得上的任务派到你的地址。交完产物，对方用 GetTask 取走。",
    dutyTitle: "在岗",
    people: (count) => `${count} 人`,
    discoveryHint: "模型读这个发现入口，一次接上所有在岗的人。",
    mcpHint: "会 A2A 的客户端用上面的发现入口。只会 MCP 时，把这个备用地址加进去。它把在岗技能变成工具，调用仍打到每个人自己的 A2A 地址。",
    rosterError: "在岗名单暂时读不出来",
    loading: "正在读取在岗名单…",
    empty: "现在没有人上工。发布一张卡并上工之后，模型才能发现你。",
  },
  agents: {
    title: "在岗",
    lead: "模型读的是同一份名单：在岗的人、他们自己写的技能，以及各自的调用地址。没上工的人不在这里。",
    discoveryHint: "把发现入口交给会 A2A 的客户端，一次接上这里所有人。",
    mcpHint: "只会 MCP 的客户端用这个备用入口。工具调用仍走每个人自己的 A2A 地址。",
    rosterError: "在岗名单读不出来",
    loading: "正在读取在岗名单…",
    empty: "现在没有人上工。",
  },
  profile: {
    forModels: "给模型",
    discoveryOn: "发现入口接上所有在岗的人。下面这个地址只接收派给这个人的任务。",
    discoveryOff: "这个人还没上工，发现入口里没有。上工之后，模型才能从名单里选到。",
    mcpHint: "只会 MCP 的客户端用这个备用入口。会 A2A 的仍读发现入口，再把任务派到这个人的地址。",
    send: "SendMessage 打到这个人的地址，configuration.returnImmediately 为 true。人交完产物后，用 GetTask 取回。",
    sample: "请按你的技能完成这件事。",
    loadError: "这张卡读不出来",
    opening: "正在打开这张卡…",
  },
  me: {
    noneTitle: "还没有你的卡",
    noneBody: "这台浏览器还没有记住你的卡。换一台机器，需要重新发布。",
    onBody: "模型可以在发现名单里看到你，并把任务派到你的地址。",
    offBody: "还没上工。上工之后，模型才发现得到你。",
    dutyError: "在岗状态没改成",
    edit: "改我的卡",
    publicCard: "看公开卡",
    discoveryHint: "LangGraph 读发现入口，一次接上所有在岗的人。你自己的地址只接收派给你的任务。",
    mcpHint: "只会 MCP 的客户端用这个备用入口。会 A2A 的仍读发现入口，再把任务派到你自己的地址。",
    tasks: "派来的任务",
    openTasks: (count) => `${count} 张还开着`,
    tasksError: "任务列表读不出来",
    loading: "正在整理你的任务…",
    empty: "还没有。上工之后，模型会把对得上的任务派到这里。",
  },
  publish: {
    edit: "改我的卡",
    create: "发布我的卡",
    lead: "名字、简介和技能都是你自己写的。每项技能写明你能完成什么。输入和输出用下面的项拼，熟悉 JSON Schema 时也可以直接写。",
    name: "名字",
    bio: "简介",
    bioPlaceholder: "你接什么，不接什么。",
    legend: "技能，1 到 6 项。名称、能完成的内容，以及要收到什么、交回什么。",
    skillName: "技能名",
    skillPlaceholder: "例如 计数",
    canDo: "能完成什么",
    canDoPlaceholder: "例如：数清画面里的东西，只交回数字。",
    removeSkill: "去掉这项",
    addSkill: "再加一项",
    duplicate: "同一边的项目名称不能重复",
    writing: "正在写入…",
    save: "保存",
    publish: "发布",
    saveError: "这张卡没有写上",
  },
  schema: {
    identifierHint: "名称写成英文标识符时，模型按这一项单独填写。",
    input: "输入",
    output: "输出",
    addField: "加一项",
    emptyFields: "还没加。不写的话，模型只看上面的说明。",
    name: "名称",
    namePlaceholder: "例如 scene",
    ariaName: (label) => `${label}名称`,
    ariaType: (label) => `${label}类型`,
    ariaNote: (label) => `${label}说明`,
    type: "类型",
    required: "必填",
    remove: "去掉",
    note: "说明",
    notePlaceholder: "可以不写",
    inputJson: "输入 JSON Schema",
    outputJson: "输出 JSON Schema",
    cannotSplit: "这份 Schema 拆不成单项，继续用 JSON 写。",
    useForm: "改用表单填写",
    useJson: "改用 JSON Schema",
    line: (label, body) => `${label} ${body}`,
  },
  notice: {
    title: "有新的活",
    from: (name) => `来自 ${name}`,
    dismiss: "知道了",
    open: "去看",
  },
  task: {
    awaitingScore: "等打分",
    from: (name) => `来自 ${name}`,
    gotScore: (score) => `获 ${score} 分`,
    scoredBy: (name, score) => `${name} 给这次工作打了 ${score} 分`,
    artifact: "产物",
    handBack: (schema) => `按这个输出交回：${schema}`,
    image: "图片",
    textOptional: "文字可以不写。这单要交一张图片。",
    writeHere: "把完成的内容写在这里。也可以附一张图。",
    imageTooBig: "图片要在 1MB 以内",
    imageType: "只接受 png、jpeg、webp、gif",
    needImage: "要交一张图片",
    submitting: "正在提交…",
    submit: "提交产物",
    needInput: "要补充",
    reject: "拒绝",
    fail: "失败",
    cancel: "取消",
    inputPlaceholder: "还缺什么。模型补上之后，这单回到进行中。",
    rejectPlaceholder: "为什么不接。",
    failPlaceholder: "卡在哪里。",
    cancelPlaceholder: "为什么取消。",
    confirm: "确认",
    statusUpdated: "状态已改。模型用 GetTask 可以读到。",
    statusError: "状态没改成",
    submitError: "没有交上去",
    opening: "正在打开这张任务…",
    loadError: "这张任务读不出来",
    incomingAlt: "派来的图片",
    returnedAlt: "交回的图片",
    pendingAlt: "待提交的图片",
    handedWaiting: "已交。等模型打分。",
  },
  output: {
    image: "图片",
    submitting: "正在提交…",
    submit: "提交产物",
    choose: "请选择",
    yes: "是",
    no: "否",
    skip: "不填",
    jsonPlaceholder: "按输出 Schema 写 JSON。",
    oneImage: "输出里一次只能有一张图片。",
    requiredSuffix: "，必填",
    noteColon: "：",
    mustFill: (label) => `${label}要填`,
    mustBe: (label) => `要是${label}`,
    fieldMustBe: (name, label) => `${name} 要是${label}`,
  },
  status: { loading: "正在读取协议状态…", retry: "重试" },
} satisfies Messages

export const en = {
  nav: { publish: "Publish", duty: "On duty", mine: "My card" },
  duty: {
    on: "On duty",
    off: "Off duty",
    model: "Model",
    unpublished: "Not published",
    working: "On duty",
    clockedOff: "Off duty",
    clockOut: "Clock out",
    clockIn: "Go on duty",
  },
  footer: "People publish their own card. Once they are on duty, models send tasks that match their skills.",
  record: { completed: "Done", score: "Score", time: "Time", empty: "—" },
  copy: {
    loading: "Loading",
    copied: "Copied",
    discovery: "Copy discovery URL",
    mcp: "Copy MCP fallback",
    mine: "Copy my address",
    person: "Copy this person's address",
    call: "Copy a call",
    callCopied: "Call copied",
  },
  home: {
    title: "A person's agent card",
    lead: "Publish an A2A card. Each skill says what you can finish. A model finds people on duty, picks one, and sends the task.",
    onDutyNow: "On duty now",
    goOnDuty: "Go on duty",
    publish: "Publish my card",
    seeDuty: "See who's on duty",
    step1Title: "Publish",
    step1Body: "Write your name, a short bio, and what each skill can finish.",
    step2Title: "On duty",
    step2Body: "Your card joins the discovery list after you go on duty.",
    step3Title: "Delegated",
    step3Body: "A model reads your skills and sends a matching task to your address. After you deliver, it picks the result up with GetTask.",
    dutyTitle: "On duty",
    people: (count) => `${count} ${count === 1 ? "person" : "people"}`,
    discoveryHint: "A model reads this discovery URL and connects to everyone on duty.",
    mcpHint:
      "Clients that speak A2A use the discovery URL above. Clients that only speak MCP add this fallback. It turns on-duty skills into tools, and each call still goes to that person's own A2A address.",
    rosterError: "The on-duty list could not be loaded",
    loading: "Loading the on-duty list…",
    empty: "Nobody is on duty. Publish a card and go on duty before a model can find you.",
  },
  agents: {
    title: "On duty",
    lead: "A model reads one list: people on duty, the skills they wrote, and each person's address. People who are off duty are not here.",
    discoveryHint: "Give the discovery URL to a client that speaks A2A. It connects to everyone here at once.",
    mcpHint: "A client that only speaks MCP uses this fallback. Tool calls still go to each person's own A2A address.",
    rosterError: "The on-duty list could not be loaded",
    loading: "Loading the on-duty list…",
    empty: "Nobody is on duty.",
  },
  profile: {
    forModels: "For models",
    discoveryOn: "The discovery URL connects everyone on duty. The address below receives tasks only for this person.",
    discoveryOff: "This person is off duty, so the discovery list leaves them out. After they go on duty, a model can pick them from the list.",
    mcpHint: "A client that only speaks MCP uses this fallback. A client that speaks A2A still reads the discovery URL, then sends the task to this person's address.",
    send: "SendMessage goes to this person's address, with configuration.returnImmediately set to true. After the person delivers, call GetTask to pick it up.",
    sample: "Please finish this using your skill.",
    loadError: "This card could not be loaded",
    opening: "Opening this card…",
  },
  me: {
    noneTitle: "No card yet",
    noneBody: "This browser has not remembered your card. On another machine, publish again.",
    onBody: "Models can see you in the discovery list and send tasks to your address.",
    offBody: "You are off duty. Models can find you after you go on duty.",
    dutyError: "Duty status was not changed",
    edit: "Edit my card",
    publicCard: "View public card",
    discoveryHint: "LangGraph reads the discovery URL and connects to everyone on duty. Your own address only receives tasks sent to you.",
    mcpHint: "A client that only speaks MCP uses this fallback. A client that speaks A2A still reads the discovery URL, then sends the task to your address.",
    tasks: "Tasks sent to you",
    openTasks: (count) => (count === 1 ? "1 still open" : `${count} still open`),
    tasksError: "The task list could not be loaded",
    loading: "Sorting your tasks…",
    empty: "None yet. After you go on duty, matching tasks show up here.",
  },
  publish: {
    edit: "Edit my card",
    create: "Publish my card",
    lead: "You write the name, bio, and skills. Each skill says what you can finish. Build the input and output from the fields below, or write JSON Schema directly.",
    name: "Name",
    bio: "Bio",
    bioPlaceholder: "What you take, and what you don't.",
    legend: "Skills, 1 to 6. A name, what it can finish, what you receive, and what you hand back.",
    skillName: "Skill name",
    skillPlaceholder: "e.g. counting",
    canDo: "What it can finish",
    canDoPlaceholder: "e.g. Count what is in the picture and hand back only the number.",
    removeSkill: "Remove this skill",
    addSkill: "Add another",
    duplicate: "Field names on the same side cannot repeat",
    writing: "Saving…",
    save: "Save",
    publish: "Publish",
    saveError: "This card was not saved",
  },
  schema: {
    identifierHint: "When a name is an English identifier, the model fills that field on its own.",
    input: "Input",
    output: "Output",
    addField: "Add a field",
    emptyFields: "None yet. If you leave this empty, the model only reads the description above.",
    name: "Name",
    namePlaceholder: "e.g. scene",
    ariaName: (label) => `${label} name`,
    ariaType: (label) => `${label} type`,
    ariaNote: (label) => `${label} note`,
    type: "Type",
    required: "Required",
    remove: "Remove",
    note: "Note",
    notePlaceholder: "Optional",
    inputJson: "Input JSON Schema",
    outputJson: "Output JSON Schema",
    cannotSplit: "This schema does not split into fields. Keep writing JSON.",
    useForm: "Use the form",
    useJson: "Use JSON Schema",
    line: (label, body) => `${label} ${body}`,
  },
  notice: {
    title: "New work",
    from: (name) => `From ${name}`,
    dismiss: "Dismiss",
    open: "Open",
  },
  task: {
    awaitingScore: "Awaiting score",
    from: (name) => `From ${name}`,
    gotScore: (score) => `Scored ${score}`,
    scoredBy: (name, score) => `${name} scored this work ${score}`,
    artifact: "Artifact",
    handBack: (schema) => `Hand this back as the output: ${schema}`,
    image: "Image",
    textOptional: "Text can be empty. This task needs an image.",
    writeHere: "Write the finished work here. You can attach an image.",
    imageTooBig: "Image must be 1MB or smaller",
    imageType: "Only png, jpeg, webp, and gif",
    needImage: "An image is required",
    submitting: "Submitting…",
    submit: "Submit work",
    needInput: "Needs input",
    reject: "Reject",
    fail: "Fail",
    cancel: "Cancel",
    inputPlaceholder: "What is still missing. After the model adds it, this task returns to in progress.",
    rejectPlaceholder: "Why you are not taking it.",
    failPlaceholder: "Where it got stuck.",
    cancelPlaceholder: "Why you are canceling.",
    confirm: "Confirm",
    statusUpdated: "Status updated. The model can read it with GetTask.",
    statusError: "The status was not changed",
    submitError: "The work was not submitted",
    opening: "Opening this task…",
    loadError: "This task could not be loaded",
    incomingAlt: "Incoming image",
    returnedAlt: "Submitted image",
    pendingAlt: "Image to submit",
    handedWaiting: "Delivered. Waiting for the model to score it.",
  },
  output: {
    image: "Image",
    submitting: "Submitting…",
    submit: "Submit work",
    choose: "Choose",
    yes: "Yes",
    no: "No",
    skip: "Leave empty",
    jsonPlaceholder: "Write JSON that matches the output schema.",
    oneImage: "The output can include only one image.",
    requiredSuffix: ", required",
    noteColon: ": ",
    mustFill: (label) => `${label} is required`,
    mustBe: (label) => `Must be ${label}`,
    fieldMustBe: (name, label) => `${name} must be ${label}`,
  },
  status: { loading: "Loading…", retry: "Retry" },
} satisfies Messages

const ERROR_EN: Record<string, string> = {
  "找不到这个 Agent": "No such agent",
  "找不到这张任务": "No such task",
  "需要一个名字": "A name is required",
  "名字用 2 到 16 个字": "Use 2 to 16 characters for the name",
  "简介要是一段文字": "The bio must be text",
  "简介最多 80 字": "The bio can be at most 80 characters",
  "至少写一项技能": "Write at least one skill",
  "最多 6 项技能": "At most 6 skills",
  "技能要包含名称和能完成的内容": "A skill needs a name and what it can finish",
  "技能名用 1 到 24 个字": "Use 1 to 24 characters for the skill name",
  "技能说明用 1 到 120 个字": "Use 1 to 120 characters for the skill description",
  "技能名不能重复": "Skill names cannot repeat",
  "输入和输出的 JSON Schema 要一起写": "Write the input and output JSON Schema together",
  "这张卡不能改": "This card cannot be edited",
  "这张卡不用上工": "This card does not go on duty",
  "在岗状态要是 true 或 false": "Duty status must be true or false",
  "先写至少一项技能再上工": "Write at least one skill before going on duty",
  "只有被派到这单的人能提交产物": "Only the person on this task can submit the work",
  "产物已经交了，等模型打分": "The work is already in. Waiting for the model to score it.",
  "产物要是一段文字": "The artifact must be text",
  "产物用 1 到 4000 个字": "Use 1 to 4000 characters for the artifact",
  "输出格式不对": "The output format does not match",
  "只有被派到这单的人能改状态": "Only the person on this task can change the status",
  "任务已经结束": "This task is already finished",
  "未知动作": "Unknown action",
  "用 1 到 200 个字说明": "Explain it in 1 to 200 characters",
  "缺少 Agent": "Missing agent",
  "请求体不是 JSON": "The request body is not JSON",
  "请求失败": "Request failed",
  "身份读取失败": "Could not read this browser's card",
  "这份输出 Schema 有对不齐的规则": "This output schema does not line up",
  "输出里一次只能有一张图片": "The output can include only one image",
  "要交一张图片": "An image is required",
  "这项输出没有图片": "This output has no image",
  "这项输出只要图片": "This output is only an image",
  "输出要按字段交，不能写自由文本": "Submit the output as fields, not free text",
  "输出要是这些字段": "The output must be these fields",
  "输出要按 Schema 交，不能留空": "Submit the output as JSON matching the schema",
  "输出要是 JSON，不能写自由文本": "The output must be JSON, not free text",
  "图片格式不对": "The image format is wrong",
  "图片只接受 png、jpeg、webp、gif": "Images must be png, jpeg, webp, or gif",
  "图片太大": "The image is too large",
  "图片内容要是 base64": "The image content must be base64",
  "图片内容和类型对不上": "The image content does not match its type",
  "图片要带 base64 或 http 地址": "The image needs base64 or an http address",
}

function schemaLabel(raw: string) {
  if (raw === "输入 Schema") return "Input schema"
  if (raw === "输出 Schema") return "Output schema"
  return raw
}

const ERROR_PATTERNS: Array<[RegExp, (matched: RegExpMatchArray) => string]> = [
  [/^(.+)要是 JSON Schema$/, (matched) => `${schemaLabel(matched[1])} must be JSON Schema`],
  [/^(.+)要是 JSON 对象$/, (matched) => `${schemaLabel(matched[1])} must be a JSON object`],
  [/^(.+)最多 (\d+) 字$/, (matched) => `${schemaLabel(matched[1])} can be at most ${matched[2]} characters`],
  [/^(.+) 要填$/, (matched) => `${matched[1]} is required`],
  [/^(.+) 要是文字$/, (matched) => `${matched[1]} must be text`],
  [/^(.+) 要是整数$/, (matched) => `${matched[1]} must be an integer`],
  [/^(.+) 要是数字$/, (matched) => `${matched[1]} must be a number`],
  [/^(.+) 要是是或否$/, (matched) => `${matched[1]} must be yes or no`],
  [/^(.+) 要是对象$/, (matched) => `${matched[1]} must be an object`],
  [/^(.+) 要是数组$/, (matched) => `${matched[1]} must be an array`],
  [/^(.+) 不在允许的值里$/, (matched) => `${matched[1]} is not an allowed value`],
  [/^(.+) 太短$/, (matched) => `${matched[1]} is too short`],
  [/^(.+) 太长$/, (matched) => `${matched[1]} is too long`],
  [/^(.+) 要是图片地址$/, (matched) => `${matched[1]} must be an image address`],
  [/^(.+) 太小$/, (matched) => `${matched[1]} is too small`],
  [/^(.+) 太大$/, (matched) => `${matched[1]} is too large`],
  [/^(.+) 项太少$/, (matched) => `${matched[1]} has too few items`],
  [/^(.+) 项太多$/, (matched) => `${matched[1]} has too many items`],
  [/^输出里没有 (.+)$/, (matched) => `The output has no ${matched[1]}`],
]

export function localizeError(message: string, locale: Locale) {
  if (locale !== "en") return message
  const exact = ERROR_EN[message]
  if (exact) return exact
  for (const [pattern, format] of ERROR_PATTERNS) {
    const matched = pattern.exec(message)
    if (matched) return format(matched)
  }
  return message
}
