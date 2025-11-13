// filepath: /cypress/support/commands.d.ts
declare namespace Cypress {
    interface Chainable {
      /**
       * Custom command to select a file.
       * @param filePath - Path to the file to upload.
       * @param options - Options for file upload.
       */
      selectFile(filePath: string, options?: Partial<Cypress.SelectOptions>): Chainable<Element>;
    }
  }