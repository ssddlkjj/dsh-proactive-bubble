# dsh-proactive-bubble

Let a DSH character start a line on its own — only while you are looking at the conversation, and only after it has been quiet for the interval you chose.

One button in the composer bar, one HTTP state route, no extra model calls.

---

## 1. Read this first (common surprises)

1. **It is per conversation.** Switch to another conversation and you get another switch. A newly opened conversation starts stopped.
2. **The window must be in front and focused.** Minimised, in a background tab, or behind another app all count as "not looking" — nothing fires. That is deliberate, so you never come back to a pile of queued bubbles.
3. **Turning it on does not fire immediately.** The first bubble waits one full interval, even if you picked 15 seconds.
4. **The flavour field only saves on Enter.** Type, then press Enter. Clicking elsewhere discards it; this is the most common surprise.
5. **It will not interrupt work.** While the character is replying or running tools, nothing pops; it waits until things are idle.
6. **Intervals are per conversation, not global.** Two open conversations can run different intervals.
7. **If the model or network fails, that one bubble is dropped.** A warning goes to the host log and the timer keeps running.
8. **It writes no files.** If your character should update a state or memory file after each bubble, that is the character's job, not this plugin's.
9. **A bubble is not a notification.** It is an ordinary assistant message, one or two sentences, in the character's own voice.

---

## 2. How to use it

**Where it is.** Look at the status bar under the message box — the row that shows `tok/s` and the cache hit rate. A new item sits there:

- `冒泡·停` — stopped
- `冒泡·开` — running

**Left click** turns it on or off for this conversation.

**Right click** opens a small menu with two things:

- *interval* — 15 s / 30 s / 1 min / 5 min / 15 min / 30 min / 1 h / 2 h. Picking one also turns it on.
- *编辑口味…* — one free-text line for this conversation, e.g. `平时别主动，只看着我说` or `多说工作上的事`. Press **Enter** to save; Escape or clicking away cancels.

**Where it is stored.** The switch, the interval and the flavour live in this browser, per conversation (`localStorage`, key `proactive.bubble.<sessionId>`). Clearing site data loses them; they do not carry over to other conversations.

**What you will see.** A normal message from the character, one or two sentences, nothing appended to the header.

---

## 3. How it works

```
client.js   draws the button and the menu
            watches focus / blur / visibilitychange and reports "focused"
            so a background tab never fires

index.js    keeps per-conversation state in memory
            every 5 s it looks for sessions where all four hold:
              enabled && focused && interval elapsed && agent idle
            then calls agent.followup(createUserMessage(...)) with the prompt,
            and flushes the session so the message is persisted
```

The plugin never composes text itself. It hands the character a prompt and lets the character's own model answer in its own voice, so a bubble reads like any other reply.

Defaults: 1800 s (30 min), clamped to 15 s – 12 h.

---

## 4. After installing: one step for your AI assistant

The bundle is generic. It does not know who your character is, which files hold their state, or how continuous scenes should be written. Without this step it will sound bland.

Send this to your assistant:

> "I just installed `dsh-proactive-bubble`. Please edit its `config.prompt` so a bubble reads my character's state files first, uses their voice, and handles continuous scenes properly. Write it for my character, not in generic wording."

Two values are usually edited:

1. **`config.prompt`** — in `cordis.patch.yml` or the plugin's config panel:

   ```yaml
   config:
     seconds: 1800
     prompt: |
       （冒泡）自己开个口，一到两句。先读你的状态文件（换成你角色的实际文件名）。
       日常就起一句闲聊；正在一段场面里就不要抽离、不要总结，只写此刻的反应。
       短，不重复上一条。
   ```

   Replace the file names with yours — the plugin cannot guess them.

2. **`config.seconds`** — the default interval. 900 (15 min) and 1800 (30 min) are the usual choices.

Restart DSH (or refresh the page) after editing.

---

## 5. Install

From a downloaded copy: on the repository page use **Code → Download ZIP**, unzip it, and point `install_bundle` at the unzipped folder. Then in DSH:

```
plugin_manager
  action: install_bundle
  target: <absolute path to that folder>
```

Restart DSH or refresh the page. The status-bar item appears on the next conversation.

---

## License

MIT.
