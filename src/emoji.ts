import { DateTime } from "luxon"

const emojiRegex = require("emoji-regex")()
const emojilib = require("emojilib")
const twemoji = require("twemoji").default

const Text = (caption: string): TextChunk => ({ type: "text", caption })
const Nickname = (caption: string): TextChunk => ({ type: "nickname", caption: caption === "🥳" ? "" : caption })
const Emoji = (caption: string, url: string = ""): TextChunk => ({ type: "emoji", caption, url })

const remap = <T, S>(vs: SMap<T>, toKey: (t: T, k: string) => string, toValue: (t: T, k: string) => S): SMap<S> => {
    const res: SMap<S> = {}
    Object.keys(vs).forEach(k => (res[toKey(vs[k], k)] = toValue(vs[k], k)))
    return res
}

export const extend = <T>(obj: T) => (delta: Partial<T>): T => ({ ...obj, ...delta })

type EmojiObj = { char: string }
const emojiByName = remap<EmojiObj, EmojiObj>(emojilib.lib, (_, name) => `:${name}:`, v => v)
const emojiNameByUtf8 = remap<EmojiObj, string>(emojiByName, v => v.char, (_, name) => name)

const replaceEmoji = (name: string) => (emojiByName[name] ? emojiByName[name].char : name)
const replaceUtf8Emoji = (text: string) => text.replace(emojiRegex, match => emojiNameByUtf8[match] || match)

const parseTextRec = (text: string, acc: TextChunk[] = []): TextChunk[] => {
    const emojiRes = /(:[a-zA-Z_0-9+-]+:)/g.exec(text)
    const emojiIndex = emojiRes ? text.indexOf(emojiRes[0]) : -1
    const nicknameRes = /(@[a-zA-Z_0-9.-]+)/g.exec(text)
    const nicknameIndex = nicknameRes ? text.indexOf(nicknameRes[0]) : -1

    if (emojiRes && (emojiIndex < nicknameIndex || nicknameIndex === -1)) {
        if (emojiIndex !== 0) acc.push(Text(text.substr(0, emojiIndex)))
        acc.push(Emoji(emojiRes[0]))
        return parseTextRec(text.substring(emojiIndex + emojiRes[0].length), acc)
    }

    if (nicknameRes && (nicknameIndex < emojiIndex || emojiIndex === -1)) {
        if (nicknameIndex !== 0) acc.push(Text(text.substr(0, nicknameIndex)))
        acc.push(Nickname(nicknameRes[0]))
        return parseTextRec(text.substring(nicknameIndex + nicknameRes[0].length), acc)
    }
    return text ? [...acc, Text(text)] : acc
}

const parseText = (text: string, acc: TextChunk[] = []) => parseTextRec(replaceUtf8Emoji(text), acc)
const emojiUrl = (name: string) => `https://twemoji.maxcdn.com/2/72x72/${name}.png`
const getter = <T, T2 extends keyof T>(obj: T, field: T2): T[T2] | null => (obj ? obj[field] : null)
const extEmoji = ({ caption }: Emoji, name: string): TextChunk =>
    Emoji(getter(emojiByName[caption], "char") || caption, emojiUrl(name))

const setEmojiUrl = async (c: TextChunk) => {
    if (c.type !== "emoji") return c
    const caption = replaceEmoji(c.caption)
    if (c.caption === caption) return new Promise<TextChunk>(res => res(c))
    return new Promise<TextChunk>(res =>
        twemoji.parse(caption, {
            callback: (name: string) => res(extEmoji(c, name)),
            onerror: () => res(c)
        })
    )
}
export const setThxUrls = async (t: ThxPartial) => extend(t)({ chunks: await Promise.all(t.chunks.map(setEmojiUrl)) })

const toRelativeDate = (s: string) =>
    (d => `${d.toRelativeCalendar()} at ${d.toLocaleString(DateTime.TIME_SIMPLE)}`)(DateTime.fromISO(s))

export const toChunks = (d: ThxPartialRaw): ThxPartial => ({
    chunks: parseText(d.body),
    id: d.id,
    createdAt: toRelativeDate(d.createdAt)
})
