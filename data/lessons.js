/* ============================================================
   lessons.js - 课程数据
   新课 schema（参考教材 3 段式结构，但已移除所有教材编号/页码/MP3 编号等残留标注）：
   {
     id, day,
     // ===== 可选元数据（用于学习导航层的目录/进度/过滤，不影响正文渲染）=====
     sequence: 1,              // 稳定的课程序号（不可用数组下标生成；插/重排时此字段不变）
     unit: '第 1 单元 入门',    // 单元分组名（后续目录按单元分组时用）
     tags: ['自我介绍', '名词谓语句'],  // 自由标签，后续筛选/搜索用
     estimatedMinutes: 30,     // 预计学习时长（分钟）

     title, subtitle,
     // ===== 模块1：单词短语汇总 =====
     vocabulary: [{ word, reading, meaning, type, accent, note }]
       accent: 语调 (0/1/2/3/4/5 或 "0/5" 等字符串)
       note: 备注，例如"貴方（*这个词多半用假名表示…）"
     phrases: [{ phrase, reading, meaning, note }]  // 短语（搭配、寒暄句等）

     // ===== 模块2：学习目标 + 例文 =====
     learningGoals: [{
       goalNumber: 1,
       goalTitle: '名词肯定句',
       mainExample: {
         jp, reading, cn,
         structure: [{ jp, role, cn }]  // 每个词块角色分析（结构拆解图）
       },
       examples: [{ jp, reading, cn, focus, note }]
         focus: 语法点（下划线强调的词，如"高校生"），可选
         note:  小字备注，可选
     }]

     // ===== 模块3：真实应用会话 =====
     dialogue: {
       title: '应用会话',
       lines: [{
         speaker,            // 佐藤 / 陳
         speakerReading,     // さとう / ちん
         jp,                 // 日文整句
         cn,                 // 中文翻译
         annotations: [{ jp, note }]  // 句中小注释
       }]
     }

     // ===== 保留模块（兼容 + 练习功能） =====
     goals: []          // 原 goals 数组，保留以兼容老编辑模式
     grammar: [{ pattern, meaning, desc, struct }]  // 兼容：目录页 course-grammar 显示用
     mistakes: [{ wrong, right, reason }]
     quiz: [{ question, sub, options:[], answerIndex, explain }]
     sentencePractice: { hint, tips: [{word, meaning}] }
     speakPractice: [{ jp, reading, cn }]
     speakTip: string
   }
   ============================================================ */

window.LESSONS = [
  /* ==================== 第1课 ==================== */
  {
    id: 'day-001',
    day: '第1课',
    sequence: 1,
    unit: '第 1 单元 入门',
    tags: ['自我介绍', '名词谓语句', 'はじめまして'],
    estimatedMinutes: 30,
    title: 'はじめまして、陳です。',
    subtitle: '初次见面，我姓陈。',

    /* ============== 模块1：本课单词 ============== */
    vocabulary: [
      { word: '私', reading: 'わたし', meaning: '我', type: '代词', accent: '0', note: '' },
      { word: '貴方', reading: 'あなた', meaning: '你', type: '代词', accent: '2', note: '*这个词多半用假名表示，较少用汉字' },
      { word: 'あの人', reading: 'あのひと', meaning: '那个人', type: '名词', accent: '2', note: '' },
      { word: '彼', reading: 'かれ', meaning: '他', type: '代词', accent: '1', note: '' },
      { word: '彼女', reading: 'かのじょ', meaning: '她', type: '代词', accent: '1', note: '' },
      { word: '学生', reading: 'がくせい', meaning: '学生', type: '名词', accent: '0', note: '' },
      { word: '高校生', reading: 'こうこうせい', meaning: '高中生', type: '名词', accent: '3', note: '' },
      { word: '会社員', reading: 'かいしゃいん', meaning: '公司职员', type: '名词', accent: '3', note: '' },
      { word: '社員', reading: 'しゃいん', meaning: '公司的职员', type: '名词', accent: '1', note: '' },
      { word: '同僚', reading: 'どうりょう', meaning: '同事', type: '名词', accent: '0', note: '' },
      { word: '主婦', reading: 'しゅふ', meaning: '家庭主妇', type: '名词', accent: '1', note: '' },
      { word: '[お]国', reading: '[お]くに', meaning: '国家，家乡', type: '名词', accent: '0', note: '「お」为郑重接头语' },
      { word: '日本人', reading: 'にほんじん', meaning: '日本人', type: '名词', accent: '4', note: '' },
      { word: 'アメリカ人', reading: 'アメリカじん', meaning: '美国人', type: '名词', accent: '4', note: '' },
      { word: '台湾', reading: 'たいわん', meaning: '台湾', type: '地名', accent: '3', note: '' },
      { word: '台北', reading: 'タイペイ', meaning: '台北', type: '地名', accent: '0', note: '' },
      { word: '名前', reading: 'なまえ', meaning: '名字', type: '名词', accent: '0', note: '' },
      { word: '会社', reading: 'かいしゃ', meaning: '公司', type: '名词', accent: '0', note: '' },
      { word: '貿易会社', reading: 'ぼうえきがいしゃ', meaning: '贸易公司', type: '名词', accent: '5', note: '' },
      { word: '携帯[電話]', reading: 'けいたい[でんわ]', meaning: '手机', type: '名词', accent: '0/5', note: '' }
    ],
    phrases: [
      { phrase: 'はじめまして', reading: 'はじめまして', meaning: '初次见面（寒暄语）', note: '用于第一次见面时的问候' },
      { phrase: 'どうぞよろしく', reading: 'どうぞよろしく', meaning: '请多多关照', note: '句尾常接「お願いします」' }
    ],

    /* ============== 模块2：学习目标 + 例文 ============== */
    learningGoals: [
      /* --- 学习目标 1：名词肯定句 --- */
      {
        goalNumber: 1,
        goalTitle: '名词肯定句',
        mainExample: {
          jp: '私は学生です。',
          reading: 'わたし がくせい',
          cn: '（我是学生。）',
          structure: [
            { jp: '私',   role: '主语·主题',                     cn: '我' },
            { jp: 'は',   role: '助词は（wa）表示主语·主题',      cn: '是' },
            { jp: '学生', role: '主语·主题的内容',                cn: '学生' },
            { jp: 'です', role: '表示肯定·断定',                   cn: '' }
          ]
        },
        examples: [
          { jp: '私は高校生です。', reading: 'わたし こうこうせい', cn: '（我是高中生。）', focus: '高校生', note: '高校生（名词）' },
          { jp: '私は中国人です。', reading: 'わたし ちゅうごくじん', cn: '（我是中国人。）', focus: '中国人', note: '' },
          { jp: '私は会社員です。', reading: 'わたし かいしゃいん', cn: '（我是公司职员。）', focus: '会社員', note: '' }
        ]
      },

      /* --- 学习目标 2：名词否定句 --- */
      {
        goalNumber: 2,
        goalTitle: '名词否定句',
        mainExample: {
          jp: '私は会社員じゃありません。',
          reading: 'わたし かいしゃいん',
          cn: '（我不是公司职员。）',
          structure: [
            { jp: '私',        role: '主语',              cn: '我' },
            { jp: 'は',        role: '表示主题',          cn: '（提示）' },
            { jp: '会社員',    role: '谓语核心',          cn: '公司职员' },
            { jp: 'じゃありません', role: '表示否定',      cn: '不是' }
          ]
        },
        examples: [
          { jp: '私は日本人じゃありません。',     reading: 'わたし にほんじん',       cn: '（我不是日本人。）', focus: '日本人', note: '' },
          { jp: 'あの人はアメリカ人じゃありません。', reading: 'あのひと アメリカじん', cn: '（那个人不是美国人。）', focus: 'アメリカ人', note: '' },
          { jp: '彼は学生じゃありません。',       reading: 'かれ がくせい',           cn: '（他不是学生。）', focus: '学生', note: '' }
        ]
      },

      /* --- 学习目标 3：名词疑问句 --- */
      {
        goalNumber: 3,
        goalTitle: '名词疑问句',
        mainExample: {
          jp: '陳さんは学生ですか。',
          reading: 'ちん さん は がくせい ですか',
          cn: '（陈先生是学生吗？）',
          structure: [
            { jp: '陳さん', role: '主语（疑问对象）', cn: '陈先生/女士' },
            { jp: 'は',     role: '提示主题',         cn: '（助词 wa）' },
            { jp: '学生',   role: '疑问谓语核心',     cn: '学生' },
            { jp: 'ですか', role: '疑问终助词（升调）', cn: '吗？' }
          ]
        },
        examples: [
          { jp: '佐藤さんは高校生ですか。',   reading: 'さとう さん は こうこうせい ですか', cn: '（佐藤先生是高中生吗？）', focus: '高校生', note: '回答：はい、そうです。/ いいえ、違います。' },
          { jp: 'あの方は中国人ですか。',     reading: 'あの かた は ちゅうごくじん ですか',   cn: '（那位是中国人吗？）',       focus: '中国人', note: 'あの方 = あの人（礼貌）' },
          { jp: '貴方は東京大学の学生ですか。', reading: 'あなた は とうきょうだいがく の がくせい ですか', cn: '（你是东京大学的学生吗？）', focus: '東京大学の学生', note: '名词 + の + 名词 → 所属修饰' }
        ]
      },

      /* --- 学习目标 4：助词「の」的用法 --- */
      {
        goalNumber: 4,
        goalTitle: '助词「の」的用法',
        mainExample: {
          jp: '私は貿易会社の社員です。',
          reading: 'わたし は ぼうえきがいしゃ の しゃいん です',
          cn: '（我是贸易公司的职员。）',
          structure: [
            { jp: '私',       role: '大主语·主题',             cn: '我' },
            { jp: 'は',       role: '提示主题',                 cn: '（助词 wa）' },
            { jp: '貿易会社', role: '修饰语（所属机构）',        cn: '贸易公司' },
            { jp: 'の',       role: '助词の（连接修饰与被修饰）', cn: '的' },
            { jp: '社員です', role: '主题内容（被修饰名词+断定）', cn: '职员。' }
          ]
        },
        examples: [
          { jp: '私の名前は陳です。',     reading: 'わたし の なまえ は ちん です',   cn: '（我的名字是小陈。）',       focus: '私の名前', note: '人称 + の + 名词 → 所属：我的…' },
          { jp: '佐藤さんの会社は松下です。', reading: 'さとう さん の かいしゃ は まつした です', cn: '（佐藤先生的公司是松下。）', focus: '佐藤さんの会社', note: '人名 + の + 机构 → 所属公司' },
          { jp: 'これは東京大学の本です。', reading: 'これ は とうきょうだいがく の ほん です', cn: '（这是东京大学的书。）',     focus: '東京大学の本', note: '机构 + の + 物品 → 属性：属于…的' }
        ]
      }
    ],

    /* ============== 模块3：真实应用会话 ============== */
    dialogue: {
      title: '应用会话',
      lines: [
        {
          speaker: '佐藤',
          speakerReading: 'さとう',
          jp: 'はじめまして、佐藤です。どうぞよろしく。',
          cn: '初次见面，你好。请多多关照。',
          annotations: [
            { jp: 'はじめまして、佐藤です。', note: '初次见面，你好' },
            { jp: 'どうぞよろしく',           note: '请多多关照' }
          ]
        },
        {
          speaker: '陳',
          speakerReading: 'ちん',
          jp: 'はじめまして、陳です。こちらこそよろしく*。',
          cn: '初次见面，我姓陈。也请您多多关照。',
          annotations: [
            { jp: 'こちらこそよろしく*', note: '也请您多多关照。「こちらこそ」是「彼此彼此」的意思' }
          ]
        },
        {
          speaker: '佐藤',
          speakerReading: 'さとう',
          jp: '陳さんのお国はどちらですか。',
          cn: '陈先生，您的国家是哪里呢？',
          annotations: [
            { jp: 'お国', note: '「お」为接头语，表达说话者的敬意' }
          ]
        },
        {
          speaker: '陳',
          speakerReading: 'ちん',
          jp: '私は台湾出身です。台北から来ました。',
          cn: '我是台湾人。从台北来的。',
          annotations: []
        },
        {
          speaker: '佐藤',
          speakerReading: 'さとう',
          jp: 'あなたは東京大学の学生ですか。',
          cn: '你是东京大学的学生吗？',
          annotations: []
        },
        {
          speaker: '陳',
          speakerReading: 'ちん',
          jp: 'いいえ、そうじゃありません。私は貿易会社の社員です。',
          cn: '不，不是。我是贸易公司的职员。',
          annotations: [
            { jp: 'いいえ、そうじゃありません。', note: '否定回答：不，不是那样的。' }
          ]
        },
        {
          speaker: '佐藤',
          speakerReading: 'さとう',
          jp: 'そうですか。はじめまして、どうぞよろしく。',
          cn: '是吗。初次见面，请多多关照。',
          annotations: []
        }
      ]
    },

    grammar: [
      { pattern: 'A は B です',     meaning: 'A 是 B（肯定）',     desc: '名词谓语句的肯定形式。は读作 wa，提示主题；です表示肯定断定。', struct: '[A] + は + [B] + です' },
      { pattern: 'A は B じゃありません', meaning: 'A 不是 B（否定）', desc: '名词谓语句的否定形式。じゃありません = ではありません（口语）。', struct: '[A] + は + [B] + じゃありません' }
    ],
    goals: [],
    mistakes: [],
    quiz: [],
    sentencePractice: { hint: '', tips: [] },
    speakPractice: [],
    speakTip: ''
  }
];
