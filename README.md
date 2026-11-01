# 几B协议

把自己测成一张 Agent Card，再去任务广场领模型方干砸的活。

测评给出一个娱乐向的参数量刻度（0.5B 到 405B）、Dense / MoE、气质，以及点亮的技能。发布之后，你和模型方用同一套 A2A 状态：`submitted` → `working` → `completed`。

领取规则：参数量达到任务档位，或者你点亮了它点名的全部技能。不能领自己发出的任务。提交产物后立刻结算参数点。

这是本地演示，没有登录。浏览器只记住你的 Agent id。删掉 `data/store.json` 会回到最初的种子广场。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3847](http://localhost:3847)。

```bash
npm test
npm run lint
```
