import path from 'node:path';
import dotenv from 'dotenv';
import { expect, test } from '@playwright/test';

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
  override: true,
});

test.use({ headless: false });
test.setTimeout(300_000);

type IncidentData = {
  url: string;
  username: string;
  password: string;
  caller: string;
  shortDescription: string;
  impact: string;
  urgency: string;
  comments: string;
};

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readIncidentData(): IncidentData {
  const impactUrgency = requiredEnvironmentValue('impact_urgency');
  const match = /^impact=([123]),urgency=([123])$/.exec(impactUrgency);
  if (!match) {
    throw new Error(
      'impact_urgency must match exactly impact=<1|2|3>,urgency=<1|2|3>',
    );
  }

  return {
    url: requiredEnvironmentValue('URL'),
    username: requiredEnvironmentValue('Username'),
    password: requiredEnvironmentValue('Password'),
    caller: requiredEnvironmentValue('Caller'),
    shortDescription: requiredEnvironmentValue('short_description'),
    impact: match[1],
    urgency: match[2],
    comments: requiredEnvironmentValue('Comments_Customer_visible'),
  };
}

test.describe('ServiceNow incident management', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const snapshotPath = testInfo.outputPath('failure-snapshot.png');
      await page.screenshot({
        path: snapshotPath,
        fullPage: true,
      });
      await testInfo.attach('failure-snapshot.png', {
        path: snapshotPath,
        contentType: 'image/png',
      });
    }
  });

  test('creates one incident through the ServiceNow UI', async ({ page }) => {
    const incident = readIncidentData();

    // Navigate to the ServiceNow instance.
    await page.goto(incident.url);

    // Enter the ServiceNow username and continue.
    await page.getByRole('textbox', { name: /user(name)?/i }).fill(incident.username);
    await page.getByRole('button', { name: /^next$/i }).click();

    // Enter the ServiceNow password and sign in.
    await page.getByRole('textbox', { name: /password/i }).fill(incident.password);
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    // Search for the Incident module.
    const navigatorFilter = page.getByRole('textbox', {
      name: /filter navigator|application navigator|search/i,
    });
    await expect(navigatorFilter).toBeVisible({ timeout: 60_000 });
    await navigatorFilter.fill('incident');

    // Open Incident and choose Create New.
    const incidentModule = page.getByRole('button', { name: 'Incident', exact: true });
    await expect(incidentModule).toBeVisible({ timeout: 60_000 });
    if ((await incidentModule.getAttribute('aria-expanded')) !== 'true') {
      await incidentModule.click();
    }
    const createNewLink = page.getByText('Create New', { exact: true });
    await expect(createNewLink).toBeVisible({ timeout: 60_000 });
    await createNewLink.click();

    // Enter the caller and select the exact recent-selection match.
    const callerField = page.getByRole('searchbox', { name: 'Caller', exact: true });
    await expect(callerField).toBeVisible({ timeout: 60_000 });
    await callerField.fill(incident.caller);
    const recentSelections = page.getByText('Recent selections', { exact: true });
    await expect(recentSelections).toBeVisible({ timeout: 60_000 });
    const callerMatch = page.getByText(incident.caller, { exact: true }).last();
    await expect(callerMatch).toBeVisible({ timeout: 60_000 });
    await callerMatch.click();

    // Enter the requested incident details.
    const shortDescription = page.locator('input[name="short_description"]');
    await expect(shortDescription).toBeVisible({ timeout: 60_000 });
    await shortDescription.fill(incident.shortDescription);
    const impact = page.locator('select[name="impact"]');
    await expect(impact).toBeVisible({ timeout: 60_000 });
    await impact.selectOption(incident.impact);
    const urgency = page.locator('select[name="urgency"]');
    await expect(urgency).toBeVisible({ timeout: 60_000 });
    await urgency.selectOption(incident.urgency);
    const comments = page.locator('textarea[name="comments"]');
    await expect(comments).toBeVisible({ timeout: 60_000 });
    await comments.fill(incident.comments);

    // Submit exactly once and verify the created incident.
    const submitButton = page.getByRole('button', { name: /submit|save/i });
    await expect(submitButton).toBeVisible({ timeout: 60_000 });
    await submitButton.click();
    const incidentNumber = page.locator('input[name="number"]');
    await expect(incidentNumber).toHaveValue(/^INC\d+$/, { timeout: 60_000 });
    await expect(callerField).toHaveValue(incident.caller, { timeout: 60_000 });
    await expect(shortDescription).toHaveValue(
      incident.shortDescription,
      { timeout: 60_000 },
    );
  });
});
