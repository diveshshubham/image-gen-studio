// // cypress/e2e/e2e.cy.ts

// /// <reference types="cypress" />

// describe('Image Studio E2E', () => {
//     it('signup → login → upload → generate → history → restore', () => {
//       cy.visit('/');
  
//       // signup
//       cy.contains('Sign up').click();
//       cy.get('input[name="email"]').type('test@example.com');
//       cy.get('input[name="password"]').type('password123');
//       cy.contains('Create account').click();
  
//       // login
//       cy.contains('Login').click();
//       cy.get('input[name="email"]').type('test@example.com');
//       cy.get('input[name="password"]').type('password123');
//       cy.contains('Sign in').click();
  
//       // upload (NO plugins needed)
//       cy.get('[data-testid="upload-input"]').selectFile('cypress/fixtures/test.png');
  
//       // prompt and style
//       cy.get('[data-testid="prompt-input"]').type('A sunset');
//       cy.get('[data-testid="style-select"]').select('photorealistic');
  
//       cy.contains('Generate').click();
  
//       // expect generation to succeed
//       cy.contains('Generation complete').should('be.visible');
//       cy.get('[data-testid="history-list"] img').should('have.length', 1);
  
//       // restore
//       cy.contains('Restore').click();
//       cy.get('[data-testid="prompt-input"]').should('have.value', 'A sunset');
//     });
//   });
  