import { phrase, type Locale } from "./copy"

export type { Locale }
export { localizeError } from "./copy"

export type Messages = {
  locale: { zh: string; en: string }
  brand: string
  nav: { publish: string; edit: string; duty: string; mine: string }
  duty: {
    on: string
    off: string
    model: string
    unpublished: string
    working: string
    clockedOff: string
    clockOut: string
    clockIn: string
    clockOutAsk: string
    clockOutYes: string
    clockOutNo: string
    opening: string
  }
  footer: string
  record: { completed: string; score: string; time: string; empty: string; unscored: string }
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
    refresh: string
    updated: (time: string) => string
    onDutyCount: (count: number) => string
    order: string
    hireQuick: string
  }
  profile: {
    forModels: string
    forModelsMore: string
    forModelsHint: string
    discoveryOn: string
    discoveryOff: string
    mcpHint: string
    send: string
    sample: string
    loadError: string
    opening: string
    hire: string
    hireTask: string
    hireSkill: string
    hireSend: string
    hireSending: string
    hireNeed: string
    hirePick: string
    hireResult: (id: string, status: string) => string
    hireOpen: string
    hireOff: string
    hireSelf: string
    callHint: string
    sentHere: string
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
    emptyOn: string
    sent: string
    sentEmpty: string
    refresh: string
    updated: (time: string) => string
    scoreDue: string
    scoreDueHint: string
    published: string
    toolId: (id: string) => string
  }
  publish: {
    edit: string
    create: string
    pageTitle: string
    pageLead: string
    lead: string
    name: string
    bio: string
    bioPlaceholder: string
    who: string
    before: string
    displayName: string
    displayPlaceholder: string
    callWhen: string
    callHint: string
    toolId: string
    toolIdHint: string
    customAdd: string
    addSkill: string
    sample: string
    samplePlaceholder: string
    askOptional: string
    useTask: string
    deliver: string
    deliverText: string
    deliverImage: string
    deliverBoth: string
    deliverAudio: string
    deliverAudioText: string
    deliverCustom: string
    advanced: string
    advancedHide: string
    previewTitle: string
    previewAgent: string
    previewWorker: string
    workerMark: string
    localOnly: string
    simulate: string
    simulateOk: string
    deliveryHint: string
    installed: string
    agentSees: string
    noPreview: string
    outputUnread: string
    pillRequired: string
    pillOptional: string
    taskLabel: string
    needTitle: string
    titleMissing: string
    needDescription: string
    pair: string
    removeSkill: string
    presetLocked: string
    previewNoName: string
    previewBlank: string
    previewNoCall: string
    previewNoTask: string
    toolIdEmpty: string
    toolIdInvalid: string
    editingTitle: (name: string) => string
    untitled: (n: number) => string
    customInvalid: string
    customReserved: string
    needSkill: string
    duplicate: string
    writing: string
    save: string
    publish: string
    saveError: string
    needBio: string
    confirmPublish: string
    previewPerson: (name: string) => string
    previewNoPerson: string
    previewSkill: (title: string) => string
    cardMark: string
    delivers: (kind: string) => string
    timedDraw: string
    timedMic: string
    cardBy: (name: string) => string
    cardNoPerson: string
    cardInputs: string
    nameVsSkill: string
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
    enum: string
    enumPlaceholder: string
    enumInvalid: string
    ariaEnum: (label: string) => string
    more: string
    less: string
    example: string
    examplePlaceholder: string
    ariaExample: (label: string) => string
    line: (label: string, body: string) => string
  }
  notice: {
    title: string
    from: (name: string) => string
    dismiss: string
    open: string
    scoreTitle: string
    handedBy: (name: string) => string
    scoreOpen: string
  }
  task: {
    awaitingScore: string
    from: (name: string) => string
    sentTo: (name: string) => string
    scoreDueLeft: (seconds: number) => string
    gotScore: (score: number) => string
    scoredBy: (name: string, score: number) => string
    artifact: string
    handBack: (schema: string) => string
    image: string
    textOptional: string
    writeHere: string
    imageTooBig: string
    imageType: string
    audioTooBig: string
    audioType: string
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
    rejectDefault: string
    failDefault: string
    cancelDefault: string
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
    progress: string
    progressPlaceholder: string
    progressSave: string
    progressSaved: string
    progressError: string
    progressDraw: string
    progressPaper: string
    progressRoll: string
    progressWetware: string
    progressMic: string
    progressBook: string
    progressHuman: string
    progressCustom: string
    scoreNow: string
    scoreSkip: string
    scoreLeft: (seconds: number) => string
    scoreSkipped: string
    scoreDone: string
    liveMark: string
    skillChip: string
    details: string
    detailsSkill: string
    detailsBrief: string
    moreActions: string
    moreHint: string
    delivered: string
    scoreWait: string
    scoreYours: string
    scoreBySender: string
    secondsUnit: string
    yourMove: string
    timelineTitle: string
    timelineLead: string
    timelineEmpty: string
    sideAgent: string
    sideHuman: string
    sideWeb: string
    stepRequest: string
    stepRequestWeb: string
    stepProgress: string
    stepArtifact: string
    stepScore: string
    stepScoreWeb: string
    stepComplete: string
    stepInput: string
    stepReject: string
    stepFail: string
    stepCancel: string
    stepNote: string
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
    drop: string
    clear: string
    oneImage: string
    oneAudio: string
    requiredSuffix: string
    noteColon: string
    mustFill: (label: string) => string
    mustBe: (label: string) => string
    fieldMustBe: (name: string, label: string) => string
    playTimed: string
    playPaper: string
    playRoll: string
    playWetware: string
    playBook: string
    playHuman: string
    playMic: string
    drawStart: string
    dropAudio: string
    micStart: string
    micStop: string
    micLeft: (seconds: number) => string
    micDone: string
    micIdle: string
    micLabel: string
    micUpload: string
    micRedo: string
    filePick: string
    fileNone: string
    drawLeft: (seconds: number) => string
    drawFrozen: string
    drawIdle: string
    drawLabel: string
    drawClear: string
    drawUndo: string
    drawRestart: string
    drawLocked: string
    drawReady: string
    drawLive: string
    timeUp: string
    micReady: string
    micLive: string
    micTaken: string
    secondsUnit: string
  }
  status: { loading: string; retry: string }
}

function bind(locale: Locale): Messages {
  const text = (path: string, vars?: Record<string, string | number>) => phrase(path, vars, locale)
  return {
    locale: { zh: text("locale.zh"), en: text("locale.en") },
    brand: text("brand"),
    nav: { publish: text("nav.publish"), edit: text("nav.edit"), duty: text("nav.duty"), mine: text("nav.mine") },
    duty: {
      on: text("duty.on"),
      off: text("duty.off"),
      model: text("duty.model"),
      unpublished: text("duty.unpublished"),
      working: text("duty.working"),
      clockedOff: text("duty.clockedOff"),
      clockOut: text("duty.clockOut"),
      clockIn: text("duty.clockIn"),
      clockOutAsk: text("duty.clockOutAsk"),
      clockOutYes: text("duty.clockOutYes"),
      clockOutNo: text("duty.clockOutNo"),
      opening: text("duty.opening"),
    },
    footer: text("footer"),
    record: {
      completed: text("record.completed"),
      score: text("record.score"),
      time: text("record.time"),
      empty: text("record.empty"),
      unscored: text("record.unscored"),
    },
    copy: {
      loading: text("copy.loading"),
      copied: text("copy.copied"),
      discovery: text("copy.discovery"),
      mcp: text("copy.mcp"),
      mine: text("copy.mine"),
      person: text("copy.person"),
      call: text("copy.call"),
      callCopied: text("copy.callCopied"),
    },
    home: {
      title: text("home.title"),
      lead: text("home.lead"),
      onDutyNow: text("home.onDutyNow"),
      goOnDuty: text("home.goOnDuty"),
      publish: text("home.publish"),
      seeDuty: text("home.seeDuty"),
      step1Title: text("home.step1Title"),
      step1Body: text("home.step1Body"),
      step2Title: text("home.step2Title"),
      step2Body: text("home.step2Body"),
      step3Title: text("home.step3Title"),
      step3Body: text("home.step3Body"),
      dutyTitle: text("home.dutyTitle"),
      people: (count) => text(count === 1 ? "home.peopleOne" : "home.peopleMany", { count }),
      discoveryHint: text("home.discoveryHint"),
      mcpHint: text("home.mcpHint"),
      rosterError: text("home.rosterError"),
      loading: text("home.loading"),
      empty: text("home.empty"),
    },
    agents: {
      title: text("agents.title"),
      lead: text("agents.lead"),
      discoveryHint: text("agents.discoveryHint"),
      mcpHint: text("agents.mcpHint"),
      rosterError: text("agents.rosterError"),
      loading: text("agents.loading"),
      empty: text("agents.empty"),
      refresh: text("agents.refresh"),
      updated: (time) => text("agents.updated", { time }),
      onDutyCount: (count) => text("agents.onDutyCount", { count }),
      order: text("agents.order"),
      hireQuick: text("agents.hireQuick"),
    },
    profile: {
      forModels: text("profile.forModels"),
      forModelsMore: text("profile.forModelsMore"),
      forModelsHint: text("profile.forModelsHint"),
      discoveryOn: text("profile.discoveryOn"),
      discoveryOff: text("profile.discoveryOff"),
      mcpHint: text("profile.mcpHint"),
      send: text("profile.send"),
      sample: text("profile.sample"),
      loadError: text("profile.loadError"),
      opening: text("profile.opening"),
      hire: text("profile.hire"),
      hireTask: text("profile.hireTask"),
      hireSkill: text("profile.hireSkill"),
      hireSend: text("profile.hireSend"),
      hireSending: text("profile.hireSending"),
      hireNeed: text("profile.hireNeed"),
      hirePick: text("profile.hirePick"),
      hireResult: (id, status) => text("profile.hireResult", { id, status }),
      hireOpen: text("profile.hireOpen"),
      hireOff: text("profile.hireOff"),
      hireSelf: text("profile.hireSelf"),
      callHint: text("profile.callHint"),
      sentHere: text("profile.sentHere"),
    },
    me: {
      noneTitle: text("me.noneTitle"),
      noneBody: text("me.noneBody"),
      onBody: text("me.onBody"),
      offBody: text("me.offBody"),
      dutyError: text("me.dutyError"),
      edit: text("me.edit"),
      publicCard: text("me.publicCard"),
      discoveryHint: text("me.discoveryHint"),
      mcpHint: text("me.mcpHint"),
      tasks: text("me.tasks"),
      openTasks: (count) => text("me.openTasks", { count }),
      tasksError: text("me.tasksError"),
      loading: text("me.loading"),
      empty: text("me.empty"),
      emptyOn: text("me.emptyOn"),
      sent: text("me.sent"),
      sentEmpty: text("me.sentEmpty"),
      refresh: text("me.refresh"),
      updated: (time) => text("me.updated", { time }),
      scoreDue: text("me.scoreDue"),
      scoreDueHint: text("me.scoreDueHint"),
      published: text("me.published"),
      toolId: (id) => text("me.toolId", { id }),
    },
    publish: {
      edit: text("publish.edit"),
      create: text("publish.create"),
      pageTitle: text("publish.pageTitle"),
      pageLead: text("publish.pageLead"),
      lead: text("publish.lead"),
      name: text("publish.name"),
      bio: text("publish.bio"),
      bioPlaceholder: text("publish.bioPlaceholder"),
      who: text("publish.who"),
      before: text("publish.before"),
      displayName: text("publish.displayName"),
      displayPlaceholder: text("publish.displayPlaceholder"),
      callWhen: text("publish.callWhen"),
      callHint: text("publish.callHint"),
      toolId: text("publish.toolId"),
      toolIdHint: text("publish.toolIdHint"),
      customAdd: text("publish.customAdd"),
      addSkill: text("publish.addSkill"),
      sample: text("publish.sample"),
      samplePlaceholder: text("publish.samplePlaceholder"),
      askOptional: text("publish.askOptional"),
      useTask: text("publish.useTask"),
      deliver: text("publish.deliver"),
      deliverText: text("publish.deliverText"),
      deliverImage: text("publish.deliverImage"),
      deliverBoth: text("publish.deliverBoth"),
      deliverAudio: text("publish.deliverAudio"),
      deliverAudioText: text("publish.deliverAudioText"),
      deliverCustom: text("publish.deliverCustom"),
      advanced: text("publish.advanced"),
      advancedHide: text("publish.advancedHide"),
      previewTitle: text("publish.previewTitle"),
      previewAgent: text("publish.previewAgent"),
      previewWorker: text("publish.previewWorker"),
      workerMark: text("publish.workerMark"),
      localOnly: text("publish.localOnly"),
      simulate: text("publish.simulate"),
      simulateOk: text("publish.simulateOk"),
      deliveryHint: text("publish.deliveryHint"),
      installed: text("publish.installed"),
      agentSees: text("publish.agentSees"),
      noPreview: text("publish.noPreview"),
      outputUnread: text("publish.outputUnread"),
      pillRequired: text("publish.pillRequired"),
      pillOptional: text("publish.pillOptional"),
      taskLabel: text("publish.taskLabel"),
      needTitle: text("publish.needTitle"),
      titleMissing: text("publish.titleMissing"),
      needDescription: text("publish.needDescription"),
      pair: text("publish.pair"),
      removeSkill: text("publish.removeSkill"),
      presetLocked: text("publish.presetLocked"),
      previewNoName: text("publish.previewNoName"),
      previewBlank: text("publish.previewBlank"),
      previewNoCall: text("publish.previewNoCall"),
      previewNoTask: text("publish.previewNoTask"),
      toolIdEmpty: text("publish.toolIdEmpty"),
      toolIdInvalid: text("publish.toolIdInvalid"),
      editingTitle: (name) => text("publish.editingTitle", { name }),
      untitled: (n) => text("publish.untitled", { n }),
      customInvalid: text("publish.customInvalid"),
      customReserved: text("publish.customReserved"),
      needSkill: text("publish.needSkill"),
      duplicate: text("publish.duplicate"),
      writing: text("publish.writing"),
      save: text("publish.save"),
      publish: text("publish.publish"),
      saveError: text("publish.saveError"),
      needBio: text("publish.needBio"),
      confirmPublish: text("publish.confirmPublish"),
      previewPerson: (name) => text("publish.previewPerson", { name }),
      previewNoPerson: text("publish.previewNoPerson"),
      previewSkill: (title) => text("publish.previewSkill", { title }),
      cardMark: text("publish.cardMark"),
      delivers: (kind) => text("publish.delivers", { kind }),
      timedDraw: text("publish.timedDraw"),
      timedMic: text("publish.timedMic"),
      cardBy: (name) => text("publish.cardBy", { name }),
      cardNoPerson: text("publish.cardNoPerson"),
      cardInputs: text("publish.cardInputs"),
      nameVsSkill: text("publish.nameVsSkill"),
    },
    schema: {
      identifierHint: text("schema.identifierHint"),
      input: text("schema.input"),
      output: text("schema.output"),
      addField: text("schema.addField"),
      emptyFields: text("schema.emptyFields"),
      name: text("schema.name"),
      namePlaceholder: text("schema.namePlaceholder"),
      ariaName: (label) => text("schema.ariaName", { label }),
      ariaType: (label) => text("schema.ariaType", { label }),
      ariaNote: (label) => text("schema.ariaNote", { label }),
      type: text("schema.type"),
      required: text("schema.required"),
      remove: text("schema.remove"),
      note: text("schema.note"),
      notePlaceholder: text("schema.notePlaceholder"),
      inputJson: text("schema.inputJson"),
      outputJson: text("schema.outputJson"),
      cannotSplit: text("schema.cannotSplit"),
      useForm: text("schema.useForm"),
      useJson: text("schema.useJson"),
      enum: text("schema.enum"),
      enumPlaceholder: text("schema.enumPlaceholder"),
      enumInvalid: text("schema.enumInvalid"),
      ariaEnum: (label) => text("schema.ariaEnum", { label }),
      more: text("schema.more"),
      less: text("schema.less"),
      example: text("schema.example"),
      examplePlaceholder: text("schema.examplePlaceholder"),
      ariaExample: (label) => text("schema.ariaExample", { label }),
      line: (label, body) => text("schema.line", { label, body }),
    },
    notice: {
      title: text("notice.title"),
      from: (name) => text("notice.from", { name }),
      dismiss: text("notice.dismiss"),
      open: text("notice.open"),
      scoreTitle: text("notice.scoreTitle"),
      handedBy: (name) => text("notice.handedBy", { name }),
      scoreOpen: text("notice.scoreOpen"),
    },
    task: {
      awaitingScore: text("task.awaitingScore"),
      from: (name) => text("task.from", { name }),
      sentTo: (name) => text("task.sentTo", { name }),
      scoreDueLeft: (seconds) => text("task.scoreDueLeft", { seconds }),
      gotScore: (score) => text("task.gotScore", { score }),
      scoredBy: (name, score) => text("task.scoredBy", { name, score }),
      artifact: text("task.artifact"),
      handBack: (schema) => text("task.handBack", { schema }),
      image: text("task.image"),
      textOptional: text("task.textOptional"),
      writeHere: text("task.writeHere"),
      imageTooBig: text("task.imageTooBig"),
      imageType: text("task.imageType"),
      audioTooBig: text("task.audioTooBig"),
      audioType: text("task.audioType"),
      needImage: text("task.needImage"),
      submitting: text("task.submitting"),
      submit: text("task.submit"),
      needInput: text("task.needInput"),
      reject: text("task.reject"),
      fail: text("task.fail"),
      cancel: text("task.cancel"),
      inputPlaceholder: text("task.inputPlaceholder"),
      rejectPlaceholder: text("task.rejectPlaceholder"),
      failPlaceholder: text("task.failPlaceholder"),
      cancelPlaceholder: text("task.cancelPlaceholder"),
      rejectDefault: text("task.rejectDefault"),
      failDefault: text("task.failDefault"),
      cancelDefault: text("task.cancelDefault"),
      confirm: text("task.confirm"),
      statusUpdated: text("task.statusUpdated"),
      statusError: text("task.statusError"),
      submitError: text("task.submitError"),
      opening: text("task.opening"),
      loadError: text("task.loadError"),
      incomingAlt: text("task.incomingAlt"),
      returnedAlt: text("task.returnedAlt"),
      pendingAlt: text("task.pendingAlt"),
      handedWaiting: text("task.handedWaiting"),
      progress: text("task.progress"),
      progressPlaceholder: text("task.progressPlaceholder"),
      progressSave: text("task.progressSave"),
      progressSaved: text("task.progressSaved"),
      progressError: text("task.progressError"),
      progressDraw: text("task.progressDraw"),
      progressPaper: text("task.progressPaper"),
      progressRoll: text("task.progressRoll"),
      progressWetware: text("task.progressWetware"),
      progressMic: text("task.progressMic"),
      progressBook: text("task.progressBook"),
      progressHuman: text("task.progressHuman"),
      progressCustom: text("task.progressCustom"),
      scoreNow: text("task.scoreNow"),
      scoreSkip: text("task.scoreSkip"),
      scoreLeft: (seconds) => text("task.scoreLeft", { seconds }),
      scoreSkipped: text("task.scoreSkipped"),
      scoreDone: text("task.scoreDone"),
      liveMark: text("task.liveMark"),
      skillChip: text("task.skillChip"),
      details: text("task.details"),
      detailsSkill: text("task.detailsSkill"),
      detailsBrief: text("task.detailsBrief"),
      moreActions: text("task.moreActions"),
      moreHint: text("task.moreHint"),
      delivered: text("task.delivered"),
      scoreWait: text("task.scoreWait"),
      scoreYours: text("task.scoreYours"),
      scoreBySender: text("task.scoreBySender"),
      secondsUnit: text("task.secondsUnit"),
      yourMove: text("task.yourMove"),
      timelineTitle: text("task.timelineTitle"),
      timelineLead: text("task.timelineLead"),
      timelineEmpty: text("task.timelineEmpty"),
      sideAgent: text("task.sideAgent"),
      sideHuman: text("task.sideHuman"),
      sideWeb: text("task.sideWeb"),
      stepRequest: text("task.stepRequest"),
      stepRequestWeb: text("task.stepRequestWeb"),
      stepProgress: text("task.stepProgress"),
      stepArtifact: text("task.stepArtifact"),
      stepScore: text("task.stepScore"),
      stepScoreWeb: text("task.stepScoreWeb"),
      stepComplete: text("task.stepComplete"),
      stepInput: text("task.stepInput"),
      stepReject: text("task.stepReject"),
      stepFail: text("task.stepFail"),
      stepCancel: text("task.stepCancel"),
      stepNote: text("task.stepNote"),
    },
    output: {
      image: text("output.image"),
      submitting: text("output.submitting"),
      submit: text("output.submit"),
      choose: text("output.choose"),
      yes: text("output.yes"),
      no: text("output.no"),
      skip: text("output.skip"),
      jsonPlaceholder: text("output.jsonPlaceholder"),
      drop: text("output.drop"),
      clear: text("output.clear"),
      oneImage: text("output.oneImage"),
      oneAudio: text("output.oneAudio"),
      requiredSuffix: text("output.requiredSuffix"),
      noteColon: text("output.noteColon"),
      mustFill: (label) => text("output.mustFill", { label }),
      mustBe: (label) => text("output.mustBe", { label }),
      fieldMustBe: (name, label) => text("output.fieldMustBe", { name, label }),
      playTimed: text("output.playTimed"),
      playPaper: text("output.playPaper"),
      playRoll: text("output.playRoll"),
      playWetware: text("output.playWetware"),
      playBook: text("output.playBook"),
      playHuman: text("output.playHuman"),
      playMic: text("output.playMic"),
      dropAudio: text("output.dropAudio"),
      micStart: text("output.micStart"),
      micStop: text("output.micStop"),
      micLeft: (seconds) => text("output.micLeft", { seconds }),
      micDone: text("output.micDone"),
      micIdle: text("output.micIdle"),
      micLabel: text("output.micLabel"),
      micUpload: text("output.micUpload"),
      micRedo: text("output.micRedo"),
      filePick: text("output.filePick"),
      fileNone: text("output.fileNone"),
      drawStart: text("output.drawStart"),
      drawLeft: (seconds) => text("output.drawLeft", { seconds }),
      drawFrozen: text("output.drawFrozen"),
      drawIdle: text("output.drawIdle"),
      drawLabel: text("output.drawLabel"),
      drawClear: text("output.drawClear"),
      drawUndo: text("output.drawUndo"),
      drawRestart: text("output.drawRestart"),
      drawLocked: text("output.drawLocked"),
      drawReady: text("output.drawReady"),
      drawLive: text("output.drawLive"),
      timeUp: text("output.timeUp"),
      micReady: text("output.micReady"),
      micLive: text("output.micLive"),
      micTaken: text("output.micTaken"),
      secondsUnit: text("output.secondsUnit"),
    },
    status: { loading: text("status.loading"), retry: text("status.retry") },
  }
}

export const zh = bind("zh")
export const en = bind("en")
