import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import './styles/App.css'
import { IDBPDatabase } from 'idb';
import Modal from './components/Modal';
import NavGroup from './components/NavGroup';
import { Editor, } from '@tinymce/tinymce-react';
import { Editor as TinyMCEEditor } from "tinymce";
import Dropdown from './components/Dropdown';

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

const fonts = [
	'Arial',
	'Calibri',
	'Comic Sans MS',
	'Consolas',
	'Corbel',
	'Courier New',
	'Georgia',
	'Segoe UI',
	'Tahoma',
	'Times New Roman',
	'Verdana',
];

const fontSizes = [
	'8pt',
	'10pt',
	'11pt',
	'12pt',
	'14pt',
	'16pt',
	'18pt',
	'24pt',
	'36pt',
	'48pt'
]

function App({ initialProps }: { initialProps: InitialProps }) {
	const db: IDBPDatabase = initialProps.db;
	const [sections, setSections] = useState<Section[]>(initialProps.sections);
	const [pages, setPages] = useState<Page[]>();
	const [selectedSectionId, setSelectedSectionId] = useState<string>(initialProps.defaultSectionId);
	const [selectedPageId, setSelectedPageId] = useState<string>(initialProps.defaultPageId);

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
	const [initialPageContent, setInitalPageContent] = useState<string>();

	const [fontFamily, setFontFamily] = useState<string>('Calibri');
	const [fontSize, setFontSize] = useState<string>('11px')
	const editorRef = useRef<TinyMCEEditor>()

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
		const titleEl = document.getElementById('title');
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

	function onContextMenu(e: any, items?: ContextMenuItem[]) {
		e.preventDefault();
		e.stopPropagation();

		if (!items) {
			setContextMenu(undefined)
			return;
		}

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

		if (!pageContent) {
			pageContent = {
				id: selectedPageId,
				content: ""
			}
		}

		setPageContent(pageContent);
		setInitalPageContent(pageContent.content)

		// Preset page content
		const pageContentEl = document.getElementById('page-content');
		if (pageContentEl) {
			pageContentEl.innerHTML = pageContent?.content as string;
		}
	}

	function executeContextMenuItem(e: any, action: () => void) {
		action();
	}

	async function deleteSection(id: string) {
		if (selectedSection && selectedSection.id === id) {
			updateDefaultSectionId(undefined);
		}

		const sectionToDelete = sections.find(section => section.id === id) as Section;

		// Update sectionOrder
		const ids = [...sections.filter(section => section.id !== id).map(section => section.id)];
		localStorage.setItem('sectionOrder', JSON.stringify(ids));

		// Delete section
		await db
			?.transaction('sections', 'readwrite')
			.objectStore('sections')
			.delete(id);

		// Delete section pages and page content
		for (let pageId of sectionToDelete.pageOrder) {
			db
				?.transaction('pages', 'readwrite')
				.objectStore('pages')
				.delete(pageId);

			db
				?.transaction('pageContent', 'readwrite')
				.objectStore('pageContent')
				.delete(pageId);
		}

		await getSections();
		setModal(null);
	}

	async function addSection(name: string) {
		const newSection: Section = {
			id: crypto.randomUUID(),
			name: name,
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
		await getPages();

		setModal(null);
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

	async function updateSectionName(section: Section, value: string) {
		section.name = value;

		await db
			?.transaction('sections', 'readwrite')
			.objectStore('sections')
			.put(section)

		await getSections();
		setModal(null);
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

	function updateSectionOrder(items: NavGroupItem[]) {
		localStorage.setItem('sectionOrder', JSON.stringify(items.map(section => section.id)));
		setSections(items as Section[]);
	}

	function updatePageOrder(items: NavGroupItem[]) {
		if (!selectedSection) return;
		selectedSection.pageOrder = items.map(item => item.id);

		db
			.transaction('sections', 'readwrite')
			.objectStore('sections')
			.put(selectedSection);

		setPages([...items as Page[]])
	}

	function updateFontFamily(value: string) {
		if (!editorRef.current) return;
		editorRef.current.execCommand('FontName', false, value);
		setFontFamily(value);
	}

	function updateFontSize(value: string) {
		if (!editorRef.current) return;
		editorRef.current.execCommand('FontSize', false, value);
		setFontSize(value);
	}

	return (
		<div className="app" onContextMenu={e => onContextMenu(e, undefined)} onClick={e => e.button === 0 && setContextMenu(undefined)}>
			<header>
				<div className="header">

				</div>
				<div className="ribbon">
					<div className="tabs">
						<div className="file tab">File</div>
						<div className="home tab">Home</div>
						<div className="insert tab">Insert</div>
						<div className="draw tab">Draw</div>
						<div className="view tab">View</div>
					</div>
					<div className="tools">
						<Dropdown
							selectedOption={fontFamily}
							setSelectedOption={updateFontFamily}
							width={128}
							options={fonts}
							borderRadius='4px 0px 0px 4px'></Dropdown>
						<Dropdown
							options={fontSizes}
							setSelectedOption={updateFontSize}
							selectedOption={fontSize}
							width={64}
							borderWidth='1px 1px 1px 0px'
							borderRadius='0px 4px 4px 0px'
						></Dropdown>
					</div>
				</div>
			</header>
			<main>
				<nav>
					<NavGroup
						title={'Sections'}
						selectedItemId={selectedSectionId}
						updateSelectedItemId={updateDefaultSectionId}
						items={sections}
						onContextMenu={(e, item) => onContextMenu(e, [
							{
								name: "Rename",
								icon: "",
								action: () => {
									setModal({
										title: 'Section Name',
										description: 'Enter a section name:',
										input: true,
										inputValue: item.name,
										onSubmit: (value) => updateSectionName(item as Section, value),
										onCancel: () => { setModal(null) }
									})
								}
							},
							{
								name: "Delete",
								icon: "",
								action: () => {
									setModal({
										title: 'Permanently Delete Section',
										description: 'Deleting a section can\'t be undone. Do you want to permanently delete this section and all of its pages?',
										onSubmit: () => { deleteSection(item.id) },
										onCancel: () => { setModal(null) },
										confirmBtnTitle: 'Permanently Delete'
									})
								}
							}
						])}
						addItemButton={{
							title: 'Add Section',
							onClick: () => setModal(
								{
									title: 'Add Section',
									description: 'Enter a Section Name',
									input: true,
									onCancel: () => { setModal(null) },
									onSubmit: addSection,
								})
						}}
						onUpdateOrder={updateSectionOrder}
						backgroundColor={'rgb(255, 228, 192)'}
					></NavGroup>
					<NavGroup
						title={'Pages'}
						selectedItemId={selectedPageId}
						updateSelectedItemId={updateDefaultPageId}
						items={pages}
						onContextMenu={(e, item) => onContextMenu(e, [{
							name: "Delete",
							icon: "",
							action: () => {
								setModal({
									title: 'Delete Page?',
									description: 'Are you sure you want to delete this page?',
									onSubmit: () => { deletePage(item.id) },
									onCancel: () => { setModal(null) },
									confirmBtnTitle: 'Delete'
								})
							}
						}])}
						addItemButton={{
							title: 'Add Page',
							onClick: addPage
						}}
						onUpdateOrder={updatePageOrder}
						backgroundColor={'rgb(255, 205, 141)'}
						placeHolderItemTitle='Untitled Page'></NavGroup>
				</nav>
				<section className="content">
					<div className="title-cont">
						{selectedPage &&
							<>
								<div className="title" id="title" contentEditable="true" onInput={e => updatePageName(e.currentTarget.textContent as string)}>{ }</div>
								<div className="timestamp">
									<div className="date">{getFormatedDate(selectedPage.date)}</div>
									<div className="time"></div>
								</div>
							</>
						}
					</div>
					{
						selectedPage &&
						<Editor
							apiKey='oiveiviekj3iuvnfezlpcb3hkw6cqf60akeo58hxw0v56evb'
							initialValue={initialPageContent}
							onEditorChange={e => updatePageContent(e)}
							onSelectionChange={(e, editor) => {
								const fontName = editor.queryCommandValue('FontName');
								const fontSize = editor.queryCommandValue('FontSize');
								setFontFamily(fontName)
								setFontSize(fontSize)
							}}
							onInit={(evt, editor) => {
								editorRef.current = editor
							}}
							init={{
								height: 500,
								menubar: false,
								toolbar: false,
								statusbar: false,
								content_style: 'p { font-family: Calibri; }'
							}}></Editor>
					}

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
