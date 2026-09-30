export type UiLang = 'en' | 'ar'

export const AI_UI: Record<
  UiLang,
  {
    hub: string
    intro: string
    empty: string
    emptyBody: string
    start: string
    preview: string
    staffPreview: string
    unavailableTitle: string
    unavailable: string
    upload: string
    choose: string
    fileHint: string
    run: string
    running: string
    will: string
    willNot: string
    allTools: string
    prior: string
    priorEmpty: string
    delete: string
    findings: string
    metrics: string
    redFlags: string
    questions: string
    sources: string
    dated: string
    status: string
    step: string
    queued: string
    reading: string
    checking: string
    writing: string
    ready: string
    failed: string
    intake: string
    draft: string
    done: string
    loadError: string
    retry: string
    listError: string
    loadingTools: string
  }
> = {
  en: {
    hub: 'AI tools',
    intro: 'Live tools only. Each one says what it checks and what it will not do.',
    empty: 'No checks are available yet.',
    emptyBody: 'When a check is turned on, it will appear here.',
    start: 'Start a check',
    preview: 'Preview',
    staffPreview: 'Staff preview',
    unavailableTitle: 'Not available',
    unavailable: 'This check is not available.',
    upload: 'Upload',
    choose: 'Choose a file',
    fileHint: 'PDF, text, CSV, spreadsheet, or document. 15 MB max.',
    run: 'Run',
    running: 'Running',
    will: 'Will',
    willNot: 'Will not',
    allTools: 'All tools',
    prior: 'Prior notes',
    priorEmpty: 'No earlier checks yet. Run one when you are ready.',
    delete: 'Delete',
    findings: 'Findings',
    metrics: 'From your file',
    redFlags: 'Red flags',
    questions: 'Questions',
    sources: 'Sources',
    dated: 'Dated',
    status: 'Status',
    step: 'Step',
    queued: 'Queued',
    reading: 'Reading',
    checking: 'Checking',
    writing: 'Writing',
    ready: 'Ready',
    failed: 'Could not finish',
    intake: 'Intake',
    draft: 'Draft',
    done: 'Done',
    loadError: 'Could not load this tool. Retry.',
    retry: 'Retry',
    listError: 'Could not load the tool list. Retry.',
    loadingTools: 'Loading tools',
  },
  ar: {
    hub: 'أدوات الذكاء الاصطناعي',
    intro: 'الأدوات المتاحة فقط. كل أداة تبين ما تفحصه وما لا تفعله.',
    empty: 'لا توجد فحوصات متاحة الآن.',
    emptyBody: 'عندما يُفعَّل فحص، يظهر هنا.',
    start: 'ابدأ فحصاً',
    preview: 'معاينة',
    staffPreview: 'معاينة للفريق',
    unavailableTitle: 'غير متاح',
    unavailable: 'هذا الفحص غير متاح.',
    upload: 'رفع',
    choose: 'اختر ملفاً',
    fileHint: 'ملف PDF أو نص أو CSV أو جدول أو مستند. الحد 15 ميغابايت.',
    run: 'تشغيل',
    running: 'جارٍ التشغيل',
    will: 'ستفعل',
    willNot: 'لن تفعل',
    allTools: 'كل الأدوات',
    prior: 'ملاحظات سابقة',
    priorEmpty: 'لا توجد فحوصات سابقة بعد.',
    delete: 'حذف',
    findings: 'النتائج',
    metrics: 'من ملفك',
    redFlags: 'نقاط الخطر',
    questions: 'أسئلة',
    sources: 'المصادر',
    dated: 'بتاريخ',
    status: 'الحالة',
    step: 'الخطوة',
    queued: 'في الانتظار',
    reading: 'قراءة',
    checking: 'فحص',
    writing: 'كتابة',
    ready: 'جاهز',
    failed: 'تعذر الإكمال',
    intake: 'استلام',
    draft: 'مسودة',
    done: 'تم',
    loadError: 'تعذر تحميل هذه الأداة. أعد المحاولة.',
    retry: 'إعادة المحاولة',
    listError: 'تعذر تحميل قائمة الأدوات. أعد المحاولة.',
    loadingTools: 'جارٍ تحميل الأدوات',
  },
}
