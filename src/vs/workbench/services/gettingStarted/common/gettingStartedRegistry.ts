/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { FileAccess } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ContextKeyExpr, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { content } from 'vs/workbench/services/gettingStarted/common/gettingStartedContent';
import { localize } from 'vs/nls';

export const enum GettingStartedCategory {
	Beginner = 'Beginner',
	Intermediate = 'Intermediate',
	Advanced = 'Advanced'
}

export interface IGettingStartedTask {
	id: string,
	title: string,
	description: string,
	category: GettingStartedCategory | string,
	when: ContextKeyExpression,
	order: number,
	button:
	| { title: string, command?: never, link: string }
	| { title: string, command: string, link?: never },
	doneOn: { commandExecuted: string, eventFired?: never } | { eventFired: string, commandExecuted?: never, }
	media: { type: 'image', path: { hc: URI, light: URI, dark: URI }, altText: string },
}

export interface IGettingStartedCategoryDescriptor {
	id: GettingStartedCategory | string
	title: string
	description: string
	icon:
	| { type: 'icon', icon: ThemeIcon }
	| { type: 'image', path: string }
	when: ContextKeyExpression
	content:
	| { type: 'items' }
	| { type: 'startEntry', command: string }
}

export interface IGettingStartedCategory {
	id: GettingStartedCategory | string
	title: string
	description: string
	icon:
	| { type: 'icon', icon: ThemeIcon }
	| { type: 'image', path: string }
	when: ContextKeyExpression
	content:
	| { type: 'items', items: IGettingStartedTask[] }
	| { type: 'startEntry', command: string }
}

export interface IGettingStartedRegistry {
	onDidAddCategory: Event<IGettingStartedCategory>
	onDidAddTask: Event<IGettingStartedTask>

	registerTask(task: IGettingStartedTask): IGettingStartedTask;
	getTask(id: string): IGettingStartedTask

	registerCategory(categoryDescriptor: IGettingStartedCategoryDescriptor): void
	getCategory(id: GettingStartedCategory | string): Readonly<IGettingStartedCategory> | undefined

	getCategories(): readonly Readonly<IGettingStartedCategory>[]
}

export class GettingStartedRegistryImpl implements IGettingStartedRegistry {
	private readonly _onDidAddTask = new Emitter<IGettingStartedTask>();
	onDidAddTask: Event<IGettingStartedTask> = this._onDidAddTask.event;
	private readonly _onDidAddCategory = new Emitter<IGettingStartedCategory>();
	onDidAddCategory: Event<IGettingStartedCategory> = this._onDidAddCategory.event;

	private readonly gettingStartedContributions = new Map<string, IGettingStartedCategory>();
	private readonly tasks = new Map<string, IGettingStartedTask>();

	public registerTask(task: IGettingStartedTask): IGettingStartedTask {
		const category = this.gettingStartedContributions.get(task.category);
		if (!category) { throw Error('Registering getting started task to category that does not exist (' + task.category + ')'); }
		if (category.content.type !== 'items') { throw Error('Registering getting started task to category that is not of `items` type (' + task.category + ')'); }
		if (this.tasks.has(task.id)) { throw Error('Attempting to register task with id ' + task.id + ' twice. Second is dropped.'); }
		this.tasks.set(task.id, task);
		category.content.items.push(task);
		this._onDidAddTask.fire(task);
		return task;
	}

	public registerCategory(categoryDescriptor: IGettingStartedCategoryDescriptor): void {
		const oldCategory = this.gettingStartedContributions.get(categoryDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite getting started category. (${categoryDescriptor})`);
			return;
		}

		const category: IGettingStartedCategory = {
			...categoryDescriptor,
			content: categoryDescriptor.content.type === 'items'
				? { type: 'items', items: [] }
				: categoryDescriptor.content
		};

		this.gettingStartedContributions.set(categoryDescriptor.id, category);
		this._onDidAddCategory.fire(category);
	}

	public getCategory(id: GettingStartedCategory | string): Readonly<IGettingStartedCategory> | undefined {
		return this.gettingStartedContributions.get(id);
	}

	public getTask(id: string): IGettingStartedTask {
		const task = this.tasks.get(id);
		if (!task) { throw Error('Attempting to access task which does not exist in registry ' + id); }
		return task;
	}

	public getCategories(): readonly Readonly<IGettingStartedCategory>[] {
		return [...this.gettingStartedContributions.values()];

	}
}

export const GettingStartedRegistryID = 'GettingStartedRegistry';
const registryImpl = new GettingStartedRegistryImpl();

content.forEach(category => {

	registryImpl.registerCategory({
		...category,
		icon: { type: 'icon', icon: category.icon },
		when: ContextKeyExpr.deserialize(category.when) ?? ContextKeyExpr.true()
	});

	if (category.content.type === 'items') {
		const convertPaths = (path: string | { hc: string, dark: string, light: string }): { hc: URI, dark: URI, light: URI } => {
			const convertPath = (path: string) => path.startsWith('https://')
				? URI.parse(path, true)
				: FileAccess.asBrowserUri('vs/workbench/services/gettingStarted/common/media/' + path, require);
			if (typeof path === 'string') {
				const converted = convertPath(path);
				return { hc: converted, dark: converted, light: converted };
			} else {
				return {
					hc: convertPath(path.hc),
					light: convertPath(path.light),
					dark: convertPath(path.dark)
				};
			}
		};

		category.content.items.forEach((item, index) => {
			registryImpl.registerTask({
				...item,
				category: category.id,
				order: index,
				when: ContextKeyExpr.deserialize(item.when) ?? ContextKeyExpr.true(),
				media: {
					type: item.media.type,
					altText: item.media.altText,
					path: convertPaths(item.media.path)
				}
			});
		});
	}
});

Registry.add(GettingStartedRegistryID, registryImpl);
export const GettingStartedRegistry: IGettingStartedRegistry = Registry.as(GettingStartedRegistryID);

ExtensionsRegistry.registerExtensionPoint({
	extensionPoint: 'welcomeItems',
	jsonSchema: {
		doNotSuggest: true,
		description: localize('gettingStarted', "Contribute items to help users in getting started with your extension. Keys correspond to categories contributed via welcomeCategories contribution point. Experimental, available in VS Code Insiders only."),
		type: 'object',
		additionalProperties: {
			type: 'array',
			items: {
				type: 'object',
				required: ['id', 'title', 'description', 'button', 'media'],
				defaultSnippets: [{ body: { 'id': '$1', 'title': '$2', 'description': '$3', 'button': { 'title': '$4' }, 'media': { 'path': '$5', 'altText': '$6' } } }],
				properties: {
					id: {
						type: 'string',
						description: localize('gettingStarted.id', "Unique identifier for this item."),
					},
					title: {
						type: 'string',
						description: localize('gettingStarted.title', "Title of item.")
					},
					description: {
						type: 'string',
						description: localize('gettingStarted.description', "Description of item.")
					},
					button: {
						description: localize('gettingStarted.button', "The item's button, which can either link to an external resource or run a command"),
						oneOf: [
							{
								type: 'object',
								required: ['title', 'command'],
								defaultSnippets: [{ 'body': { 'title': '$1', 'command': '$2' } }],
								properties: {
									title: {
										type: 'string',
										description: localize('gettingStarted.button.title', "Title of button.")
									},
									command: {
										type: 'string',
										description: localize('gettingStarted.button.command', "Command to run when button is clicked. Running this command will mark the item completed.")
									}
								}
							},
							{
								type: 'object',
								required: ['title', 'link'],
								defaultSnippets: [{ 'body': { 'title': '$1', 'link': '$2' } }],
								properties: {
									title: {
										type: 'string',
										description: localize('gettingStarted.button.title', "Title of button.")
									},
									link: {
										type: 'string',
										description: localize('gettingStarted.button.link', "Link to open when button is clicked. Opening this link will mark the item completed.")
									}
								}
							}
						]
					},
					media: {
						type: 'object',
						required: ['path', 'altText'],
						description: localize('gettingStarted.media', "Image to show alongside this item."),
						defaultSnippets: [{ 'body': { 'altText': '$1' } }],
						properties: {
							path: {
								description: localize('gettingStarted.media.path', "Either a single string path to an image to be used on all color themes, or separate paths for light, dark, and high contrast themes."),
								oneOf: [
									{
										type: 'string',
										defaultSnippets: [{ 'body': '$1' }],
									},
									{
										type: 'object',
										defaultSnippets: [{ 'body': { 'hc': '$1', 'light': '$2', 'dark': '$3' } }],
										required: ['hc', 'light', 'dark'],
										properties: {
											hc: { type: 'string' },
											light: { type: 'string' },
											dark: { type: 'string' },
										}
									},
								]
							},
							altText: {
								type: 'string',
								description: localize('gettingStarted.media.altText', "Alternate text to display when the image cannot be loaded or in screen readers.")
							}
						}
					},
					doneOn: {
						oneOf: [
							{
								type: 'object',
								required: ['event'],
								properties: {
									'event': {
										description: localize('gettingStarted.oneOn.event', "Mark item done when the specified event is marked via the invoking the `welcomeItems.markEvent` command."),
										type: 'string'
									}
								}
							},
							{
								type: 'object',
								required: ['command'],
								properties: {
									'command': {
										description: localize('gettingStarted.oneOn.command', "Mark item done when the specified command is executed."),
										type: 'string'
									}
								}
							},
						],
						description: localize('gettingStarted.doneOn', "Signal to mark item as complete. If not defined, running the button's command will mark the item complete.")
					},
					when: {
						type: 'string',
						description: localize('gettingStarted.when', "Context key expression to control the visibility of this getting started item.")
					}
				}
			}
		}
	}
});

ExtensionsRegistry.registerExtensionPoint({
	extensionPoint: 'welcomeCategories',
	jsonSchema: {
		doNotSuggest: true,
		description: localize('welcomeCategories', "Contribute categories of items to help users in getting started with your extension. Items themselves are contributed via welcomeItems contribution point. Experimental, available in VS Code Insiders only."),
		type: 'array',
		items: {
			type: 'object',
			required: ['id', 'title', 'description'],
			defaultSnippets: [{ body: { 'id': '$1', 'title': '$2', 'description': '$3' } }],
			properties: {
				id: {
					type: 'string',
					description: localize('welcomeCategories.id', "Unique identifier for this category."),
				},
				title: {
					type: 'string',
					description: localize('welcomeCategories.title', "Title of category.")
				},
				description: {
					type: 'string',
					description: localize('welcomeCategories.description', "Description of category.")
				},
				when: {
					type: 'string',
					description: localize('welcomeCategories.when', "Context key expression to control the visibility of this category.")
				}
			}
		}
	}
});
