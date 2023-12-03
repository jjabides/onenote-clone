import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { IDBPDatabase } from 'idb';
import Modal from './components/modal';

const CONTEXT_MENU_WIDTH = 200;
const CONTEXT_MENU_ITEM_HEIGHT = 36;

const MONTH_MAP: any = {
  'Jan': 'January',
  'Feb': 'February',
  'Mar': 'March',
  'Apr': 'April',
  'May': 'May',
  'Jun': 'June',
  'Jul': 'July',
  'Aug': 'August',
  'Sep': 'September',
  'Oct': 'October',
  'Nov': 'November',
  'Dec': 'December',
}

const WEEK_MAP: any = {
  'Mon': 'Monday',
  'Tue': 'Tuesday',
  'Wed': 'Wednesday',
  'Thu': 'Thursday',
  'Fri': 'Friday',
  'Sat': 'Saturday',
  'Sun': 'Sunday',
}

function App({ initialProps }: { initialProps: InitialProps }) {
  const db: IDBPDatabase = initialProps.db;
  const [sections, setSections] = useState<Section[]>(initialProps.sections);
  const [pages, setPages] = useState<Page[]>();
  const [selectedSectionId, setSelectedSectionId] = useState<string>(initialProps.defaultSectionId);
  let [selectedPageId, setSelectedPageId] = useState<string>(initialProps.defaultPageId)

  const selectedSection = useMemo(() => {
    if (!selectedSectionId || !sections) return undefined;
    return sections.find(section => section.id === selectedSectionId);
  }, [selectedSectionId, sections]);

  const selectedPage = useMemo(() => {
    if (!selectedPageId || !pages) return undefined;
    return pages.find(page => page.id === selectedPageId);
  }, [selectedPageId, pages]);

  const [contextMenu, setContextMenu] = useState<ContextMenu>();
  const [modal, setModal] = useState<Modal | null>();

  const [pageContent, setPageContent] = useState<PageContent>();

  // Update pages when selectedSection changes 
  useEffect(() => {
    if (!selectedSection) {
      setPages(undefined);
      return;
    }

    getPages();
  }, [selectedSection])

  // Set pageContent when selectedPage is set
  useEffect(() => {
    if (!selectedPage) {
      setPageContent(undefined);
      return;
    }

    getPageContent();

    // Preset title value
    const titleEl = document.getElementById('title')
    if (titleEl) {
      titleEl.textContent = selectedPage.name;
      titleEl.focus()
    }
  }, [selectedPage]);

  function updateDefaultSectionId(id?: string) {
    if (!id) {
      localStorage.removeItem('defaultSectionId');
    } else {
      localStorage.setItem('defaultSectionId', id);
    }

    setSelectedSectionId(id as string);
  }

  function updateDefaultPageId(id?: string) {
    if (!id) {
      localStorage.removeItem('defaultPageId');
    } else {
      localStorage.setItem('defaultPageId', id);
    }

    setSelectedPageId(id as string);
  }

  function updateSectionOrder() {
    localStorage.setItem('sectionOrder', JSON.stringify(sections.map((section) => section.id)));
  }

  function onContextMenu(e: any, items?: ContextMenuItem[]) {
    e.preventDefault();
    e.stopPropagation();

    if (!items) {
      setContextMenu(undefined)
      return;
    }

    selectedPageId = "";

    // TODO: Make sure client window fits within screen space (use ResizeObserver?)
    setContextMenu({
      id: crypto.randomUUID(),
      top: e.clientY + 12,
      left: e.clientX,
      items: items as ContextMenuItem[]
    });
  }

  async function getSections() {
    const sections = await db
      ?.transaction('sections')
      .objectStore('sections')
      .getAll() as Section[];

    let sectionOrderStr = localStorage.getItem('sectionOrder');

    if (!sectionOrderStr) {
      setSections(sections);
      return;
    }

    let sectionOrder = JSON.parse(sectionOrderStr) as string[];
    const sectionsMap = new Map<string, Section>(sections.map((section) => [section.id, section]));
    let orderedSections: Section[] = sectionOrder.map(id => sectionsMap.get(id)) as Section[];

    setSections(orderedSections);
  }

  async function getPages() {

    const pages = await db
      ?.transaction('pages')
      .objectStore('pages')
      .index('sectionId')
      .getAll(selectedSectionId) as Page[];

    const pagesMap = new Map<string, Page>(pages.map(page => [page.id, page]));
    let orderedPages = selectedSection?.pageOrder.map(id => pagesMap.get(id)) as Page[];
    orderedPages = orderedPages.filter(page => page);
    setPages(orderedPages);
  }

  async function getPageContent() {
    let pageContent: PageContent = await db
      .transaction('pageContent')
      .objectStore('pageContent')
      .get(selectedPageId);

    if (!pageContent) pageContent = {
      id: selectedPageId,
      content: ""
    }

    setPageContent(pageContent);
  }

  function executeContextMenuItem(e: any, action: () => void) {
    action();
  }

  async function deleteSection(id: string) {
    if (selectedSection && selectedSection.id === id) {
      updateDefaultSectionId(undefined);
    }

    const ids = [...sections.filter(section => section.id !== id).map(section => section.id)];
    localStorage.setItem('sectionOrder', JSON.stringify(ids));

    await db
      ?.transaction('sections', 'readwrite')
      .objectStore('sections')
      .delete(id);

    await getSections();
  }

  async function addSection(e: any) {
    e.preventDefault();

    const newSection: Section = {
      id: crypto.randomUUID(),
      name: e.target[0].value,
      pageOrder: [],
      date: new Date(),
    }

    const ids = [...sections.map(section => section.id), newSection.id];
    localStorage.setItem('sectionOrder', JSON.stringify(ids));

    await db
      ?.transaction('sections', 'readwrite')
      .objectStore('sections')
      .add(newSection)

    await getSections();
    setModal(null);
  }

  async function addPage() {
    if (!selectedSection || !pages) return;

    let newPage: Page = {
      id: crypto.randomUUID(),
      sectionId: selectedSection.id,
      date: new Date(),
      name: "",
    }

    // Update selected section
    let newSelectedSection: Section = { ...selectedSection, pageOrder: [...selectedSection.pageOrder, newPage.id] }
    await db
      .transaction('sections', 'readwrite')
      .objectStore('sections')
      .put(newSelectedSection);

    // Add page
    await db
      .transaction('pages', 'readwrite')
      .objectStore('pages')
      .add(newPage)

    // Get updated sections
    await getSections();

    // Get updated pages
    await getPages()

    setSelectedPageId(newPage.id);
  }

  async function deletePage(pageId: string) {
    if (!selectedSection || !pages) return;

    if (pageId === selectedPageId) {
      updateDefaultPageId(undefined);
    }

    // Update selected section page order
    const newPageOrder = selectedSection.pageOrder.filter((id) => id !== pageId);
    const newSelectedSection: Section = { ...selectedSection, pageOrder: newPageOrder }

    await db
      .transaction('sections', 'readwrite')
      .objectStore('sections')
      .put(newSelectedSection);

    // Delete page
    await db
      .transaction('pages', 'readwrite')
      .objectStore('pages')
      .delete(pageId)

    // Delete page content
    await db
      .transaction('pageContent', 'readwrite')
      .objectStore('pageContent')
      .delete(pageId);

    // Update sections
    await getSections();

    // Update pages
    await getPages()
  }

  let updatePageContentTimer: any;
  async function updatePageContent(content: string) {
    const newPageContent: PageContent = {
      ...pageContent as PageContent,
      content,
    }

    if (updatePageContentTimer) {
      clearTimeout(updatePageContentTimer);
    }

    // Throttle update
    updatePageContentTimer = setTimeout(async () => {
      await db
        .transaction('pageContent', 'readwrite')
        .objectStore('pageContent')
        .put(newPageContent)
      updatePageContentTimer = undefined;
    }, 300)

    setPageContent(newPageContent);
  }

  async function updatePageName(name: string) {
    const newPage = { ...selectedPage, name } as Page;

    let page = pages?.find(page => page.id === selectedPage?.id);
    if (page) page.name = name;

    setPages([...pages as Page[]]);

    db
      .transaction('pages', 'readwrite')
      .objectStore('pages')
      .put(newPage);
  }

  function updateSectionName(name: string) {

  }

  function getFormatedDate(date: Date) {
    let [weekDay, month, day, year] = date.toDateString().split(' ');
    weekDay = WEEK_MAP[weekDay];
    month = MONTH_MAP[month];

    let hours = date.getHours() === 12 ? 12 : (date.getHours() % 12);
    let minutes = (date.getMinutes() + "").padStart(2, "0");
    let meridiem = date.getHours() < 12 ? "AM" : "PM";

    return `${weekDay}, ${month} ${day}, ${year} ${hours}:${minutes} ${meridiem}`
  }

  return (
    <div className="app" onContextMenu={e => onContextMenu(e, undefined)} onClick={e => e.button === 0 && setContextMenu(undefined)}>
      <header>
      </header>
      <main>
        <nav>
          <div className="sections">
            <h1 className="pad-16">Sections</h1>
            <ul>
              {
                sections.map(({ id, name }) => (
                  <li className={`btn pad-8-16 ${id === selectedSectionId ? 'selected' : ''}`} key={id}
                    onClick={() => updateDefaultSectionId(id)}
                    onContextMenu={e => onContextMenu(e, [
                      {
                        name: "Rename",
                        icon: "",
                        action: () => { }
                      },
                      {
                        name: "Delete",
                        icon: "",
                        action: () => {
                          setModal({
                            title: 'Permanently Delete Section',
                            description: 'Deleting a section can\'t be undone. Do you want to permanently delete this section and all of its pages?',
                            onSubmit: () => { deleteSection(id) }
                          })
                        }
                      }
                    ])}>
                    {name}
                  </li>
                ))
              }
            </ul>
            <div
              className="btn pad-12-16"
              onClick={() => setModal(
                {
                  title: 'Add Section',
                  description: 'Enter a Section Name',
                  onSubmit: addSection,
                })}>Add Section</div>
          </div>
          <div className="pages">
            <h1 className="pad-16">Pages</h1>
            <ul>
              {
                pages && pages.map((page) => (
                  <li
                    className={`btn pad-8-16 ${page.id === selectedPageId ? 'selected' : ''}`}
                    key={page.id}
                    onClick={() => updateDefaultPageId(page.id)}
                    onContextMenu={e => onContextMenu(e, [{
                      name: "Delete",
                      icon: "",
                      action: () => { deletePage(page.id) }
                    }])}>
                    {page.name === "" ? "Untitled Page" : page.name}
                  </li>
                ))
              }
            </ul>
            <div className="btn add-page pad-12-16" onClick={addPage}>Add Page</div>
          </div>
        </nav>
        <section className="content">
          <div className="title-cont">
            {selectedPage &&
              <>
                <div className="title" id="title" contentEditable={true} onInput={e => updatePageName(e.currentTarget.textContent as string)}>{ }</div>
                <div className="timestamp">
                  <div className="date">{getFormatedDate(selectedPage.date)}</div>
                  <div className="time"></div>
                </div>
              </>
            }
          </div>
          {pageContent && <textarea value={pageContent.content} onChange={e => updatePageContent(e.target.value)}></textarea>}

        </section>
      </main>
      {
        contextMenu &&
        <div key={contextMenu.id}
          className="context-menu"
          style={{
            top: contextMenu.top + 'px',
            left: contextMenu.left + 'px'
          }}>
          {
            contextMenu.items.map((item, index) =>
            (
              <div className="item btn pad-8"
                style={{
                  width: CONTEXT_MENU_WIDTH + 'px',
                  height: CONTEXT_MENU_ITEM_HEIGHT + 'px',
                }}
                key={index}
                onClick={e => executeContextMenuItem(e, item.action)}>
                {item.name}
              </div>
            ))
          }
        </div>
      }
      {
        modal && (
          <>
            <div className="overlay" onClick={() => setModal(null)}></div>
            <Modal {...modal}></Modal>
          </>
        )
      }
    </div>
  )
}

export default App
