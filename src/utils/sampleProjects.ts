import { SubtitleCue, normalizeSubtitleText } from './subtitleEngine';

export interface SampleVideoProject {
  id: string;
  title: string;
  titleBn: string;
  category: string;
  duration: number; // in seconds
  resolution: string;
  fps: number;
  themeColor: string;
  accentColor: string;
  sceneType: 'documentary' | 'tech-keynote' | 'podcast';
  cues: SubtitleCue[];
}

const RAW_SAMPLE_VIDEO_PROJECTS: SampleVideoProject[] = [
  {
    id: 'sundarbans-doc',
    title: 'Sundarbans: Guardians of the Delta',
    titleBn: 'সুন্দরবন: বদ্বীপের অতন্দ্র প্রহরী',
    category: 'Broadcast Documentary',
    duration: 28,
    resolution: '1920x1080',
    fps: 30,
    themeColor: '#064E3B',
    accentColor: '#10B981',
    sceneType: 'documentary',
    cues: [
      {
        id: 'cue-1',
        startTime: 0.4,
        endTime: 4.2,
        textBn: 'বিশ্বের বৃহত্তম ম্যানগ্রোভ বন সুন্দরবন আমাদের প্রাকৃতিক ঢাল।',
        textEn: 'The Sundarbans, the world’s largest mangrove forest, is our natural shield.',
        speaker: 'Narrator',
        confidence: 0.99,
      },
      {
        id: 'cue-2',
        startTime: 4.5,
        endTime: 8.6,
        textBn: 'প্রতিদিন জোয়ার-ভাটার ছন্দে এখানে জীবন নতুন করে জেগে ওঠে।',
        textEn: 'Every day, life awakens anew here to the rhythm of the rising and falling tides.',
        speaker: 'Narrator',
        confidence: 0.98,
      },
      {
        id: 'cue-3',
        startTime: 9.0,
        endTime: 13.4,
        textBn: 'উপকূলীয় লক্ষ লক্ষ মানুষের জীবন ও জীবিকা এই বনের ওপর নির্ভরশীল।',
        textEn: 'The lives and livelihoods of millions along the coast depend on this forest.',
        speaker: 'Narrator',
        confidence: 0.99,
      },
      {
        id: 'cue-4',
        startTime: 13.8,
        endTime: 18.2,
        textBn: 'কিন্তু জলবায়ু পরিবর্তন ও লবণাক্ততা বৃদ্ধি আজ বড় হুমকি হয়ে দাঁড়িয়েছে।',
        textEn: 'Yet climate change and rising salinity now pose an unprecedented threat.',
        speaker: 'Narrator',
        confidence: 0.97,
      },
      {
        id: 'cue-5',
        startTime: 18.6,
        endTime: 23.1,
        textBn: 'আধুনিক প্রযুক্তি ও স্থানীয় মানুষের সচেতনতাই পারে এই ঐতিহ্য রক্ষা করতে।',
        textEn: 'Modern conservation technology and local stewardship can protect this heritage.',
        speaker: 'Narrator',
        confidence: 0.99,
      },
      {
        id: 'cue-6',
        startTime: 23.5,
        endTime: 27.6,
        textBn: 'আমাদের ভবিষ্যৎ প্রজন্মের জন্য সুন্দরবনকে নিরাপদ রাখা আমাদেরই দায়িত্ব।',
        textEn: 'Keeping the Sundarbans safe for future generations is our shared responsibility.',
        speaker: 'Narrator',
        confidence: 0.99,
      },
    ],
  },
  {
    id: 'dhaka-tech-keynote',
    title: 'Next-Gen AI in Bengali Computing',
    titleBn: 'বাংলা কম্পিউটিংয়ে কৃত্রিম বুদ্ধিমত্তার নতুন দিগন্ত',
    category: 'Tech Keynote',
    duration: 24,
    resolution: '1920x1080',
    fps: 60,
    themeColor: '#1E1B4B',
    accentColor: '#F59E0B',
    sceneType: 'tech-keynote',
    cues: [
      {
        id: 'tech-1',
        startTime: 0.3,
        endTime: 4.3,
        textBn: 'আজকের ডিজিটাল যুগে বাংলা ভাষার সঠিক ইউনিকোড রেন্ডারিং অত্যন্ত গুরুত্বপূর্ণ।',
        textEn: 'In today’s digital era, accurate Unicode rendering for Bangla is essential.',
        speaker: 'Keynote Speaker',
        confidence: 0.99,
      },
      {
        id: 'tech-2',
        startTime: 4.6,
        endTime: 9.1,
        textBn: 'যুক্তবর্ণ ও ফন্ট মিসম্যাচের কারণে প্রায়ই ভিডিও সাবটাইটেল পড়তে সমস্যা হয়।',
        textEn: 'Conjunct glyph mismatches often make video subtitles difficult to read.',
        speaker: 'Keynote Speaker',
        confidence: 0.98,
      },
      {
        id: 'tech-3',
        startTime: 9.5,
        endTime: 14.2,
        textBn: 'আমাদের অটোমেটিক সাবটাইটেল ইঞ্জিন ফ্রেম-বাই-ফ্রেম অডিও সিঙ্ক নিশ্চিত করে।',
        textEn: 'Our automatic subtitle engine guarantees frame-by-frame audio synchronization.',
        speaker: 'Keynote Speaker',
        confidence: 0.99,
      },
      {
        id: 'tech-4',
        startTime: 14.6,
        endTime: 19.0,
        textBn: 'বাংলা এবং ইংরেজি—উভয় ভাষাতেই এক ক্লিকে নির্ভুল ক্যাপশন তৈরি ও এডিট করুন।',
        textEn: 'Generate and edit accurate captions in both Bangla and English with one click.',
        speaker: 'Keynote Speaker',
        confidence: 0.99,
      },
      {
        id: 'tech-5',
        startTime: 19.4,
        endTime: 23.6,
        textBn: 'স্ট্যান্ডার্ড ব্রডকাস্ট ফন্টের মাধ্যমে আপনার কনটেন্ট হয়ে উঠুক আরও পেশাদার।',
        textEn: 'Elevate your content with broadcast-standard typography and zero mismatch.',
        speaker: 'Keynote Speaker',
        confidence: 0.99,
      },
    ],
  },
  {
    id: 'creator-podcast',
    title: 'Creator Studio: Storytelling Craft',
    titleBn: 'ক্রিয়েটর স্টুডিও: গল্প বলার কৌশল',
    category: 'Creator Podcast',
    duration: 20,
    resolution: '1920x1080',
    fps: 30,
    themeColor: '#31102F',
    accentColor: '#EC4899',
    sceneType: 'podcast',
    cues: [
      {
        id: 'pod-1',
        startTime: 0.5,
        endTime: 4.8,
        textBn: 'একটি ভালো ভিডিওর মূল শক্তি হলো তার স্পষ্ট শব্দ এবং নির্ভুল সাবটাইটেল।',
        textEn: 'The core strength of a great video is clear audio paired with accurate subtitles.',
        speaker: 'Host',
        confidence: 0.99,
      },
      {
        id: 'pod-2',
        startTime: 5.1,
        endTime: 9.8,
        textBn: 'অনেক দর্শক সাউন্ড ছাড়াই সোশ্যাল মিডিয়ায় ভিডিও দেখে থাকেন।',
        textEn: 'Many viewers watch videos on social media with the sound turned off.',
        speaker: 'Guest',
        confidence: 0.98,
      },
      {
        id: 'pod-3',
        startTime: 10.2,
        endTime: 14.9,
        textBn: 'তাই সাবটাইটেলের ফন্ট যদি পরিষ্কার ও মানসম্মত হয়, দর্শক শেষ পর্যন্ত ভিডিওটি দেখেন।',
        textEn: 'When subtitle fonts are clean and legible, viewers stay engaged till the end.',
        speaker: 'Host',
        confidence: 0.99,
      },
      {
        id: 'pod-4',
        startTime: 15.3,
        endTime: 19.6,
        textBn: 'চলুন দেখে নেওয়া যাক কীভাবে খুব সহজেই সাবটাইটেল কাস্টমাইজ করা যায়।',
        textEn: 'Let us explore how easily you can customize and synchronize every caption.',
        speaker: 'Host',
        confidence: 0.99,
      },
    ],
  },
];

export const SAMPLE_VIDEO_PROJECTS: SampleVideoProject[] =
  RAW_SAMPLE_VIDEO_PROJECTS.map((project) => ({
    ...project,
    titleBn: normalizeSubtitleText(project.titleBn),
    cues: project.cues.map((cue) => ({
      ...cue,
      textBn: normalizeSubtitleText(cue.textBn),
      textEn: normalizeSubtitleText(cue.textEn),
    })),
  }));
