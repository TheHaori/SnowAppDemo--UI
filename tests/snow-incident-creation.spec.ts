import path from 'node:path';
import dotenv from 'dotenv';
import { expect, test } from '@playwright/test';

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
  override: true,
});

test.use({ headless: false, actionTimeout: 60_000, navigationTimeout: 60_000 });
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
    await page.goto(incident.url, { waitUntil: 'domcontentloaded' });

    // Enter the ServiceNow username and continue.
    const usernameField = page.getByRole('textbox', { name: /user(name)?/i });
    await expect(usernameField).toBeVisible({ timeout: 60_000 });
    await usernameField.fill(incident.username);
    const nextButton = page.getByRole('button', { name: /^next$/i });
    await expect(nextButton).toBeVisible({ timeout: 60_000 });
    await nextButton.click();

    // Enter the ServiceNow password and sign in.
    const passwordField = page.getByRole('textbox', { name: /password/i });
    await expect(passwordField).toBeVisible({ timeout: 60_000 });
    await passwordField.fill(incident.password);
    const loginButton = page.getByRole('button', { name: /log in|sign in/i });
    await expect(loginButton).toBeVisible({ timeout: 60_000 });
    await loginButton.click();

    // Search for the Incident module.
    const navigatorFilter = page.getByRole('textbox', {
      name: /filter navigator|application navigator|search/i,
    });
    // After login the home page sometimes never finishes rendering. Reloading is
    // safe here (nothing has been created yet), so reload and wait again.
    await expect(async () => {
      try {
        await expect(navigatorFilter).toBeVisible({ timeout: 25_000 });
      } catch (error) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        throw error;
      }
    }).toPass({ timeout: 60_000, intervals: [0] });
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

    // The incident form is rendered inside the ServiceNow content iframe.
    const form = page.frameLocator('iframe#gsft_main');

    // Enter the caller and select the exact recent-selection match.
    const callerField = form.locator('input[id="sys_display.incident.caller_id"]');
    await expect(callerField).toBeVisible({ timeout: 60_000 });
    // Wait for the form to render, then type the caller. The reference dropdown
    // is attached by form scripts that can load late, so retry until it appears.
    await form.locator('input[name="incident.short_description"]').waitFor({ timeout: 60_000 });
    const callerDropdown = form.locator('[id="AC.incident.caller_id"]');
    const recentSelections = callerDropdown.getByText('Recent selections', { exact: true });
    await expect(async () => {
      await callerField.click();
      await callerField.fill('');
      await callerField.pressSequentially(incident.caller, { delay: 100 });
      await expect(recentSelections).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    const callerMatch = callerDropdown.getByText(incident.caller, { exact: true });
    await expect(callerMatch).toBeVisible({ timeout: 60_000 });
    await callerMatch.click();

    // Enter the requested incident details.
    const shortDescription = form.locator('input[name="incident.short_description"]');
    await expect(shortDescription).toBeVisible({ timeout: 60_000 });
    await shortDescription.fill(incident.shortDescription);
    const impact = form.locator('select[name="incident.impact"]');
    await expect(impact).toBeVisible({ timeout: 60_000 });
    await impact.selectOption(incident.impact);
    const urgency = form.locator('select[name="incident.urgency"]');
    await expect(urgency).toBeVisible({ timeout: 60_000 });
    await urgency.selectOption(incident.urgency);
    const comments = form.locator('textarea[name="incident.comments"]');
    await expect(comments).toBeVisible({ timeout: 60_000 });
    await comments.fill(incident.comments);

    // Submit exactly once and verify the created incident.
    const submitButton = form.getByRole('button', { name: 'Submit', exact: true }).first();
    await expect(submitButton).toBeVisible({ timeout: 60_000 });
    // The number is generated when the form opens; capture it before submitting.
    const incidentNumber = form.locator('input[name="incident.number"]');
    await expect(incidentNumber).toHaveValue(/^INC\d+$/, { timeout: 60_000 });
    const createdNumber = await incidentNumber.inputValue();
    await submitButton.click();

    // Wait until the new-record form is gone, which means the insert finished.
    await expect(shortDescription).toBeHidden({ timeout: 60_000 });

    // Reopen the saved record by its number and verify what was stored.
    const recordUrl = new URL(
      `/now/nav/ui/classic/params/target/${encodeURIComponent(
        `incident.do?sysparm_query=number=${createdNumber}`,
      )}`,
      incident.url,
    ).toString();
    await page.goto(recordUrl);
    const savedNumber = form.locator('input[name="incident.number"]');
    await expect(savedNumber).toHaveValue(createdNumber, { timeout: 60_000 });
    await expect(form.locator('input[id="sys_display.incident.caller_id"]')).toHaveValue(
      incident.caller,
      { timeout: 60_000 },
    );
    await expect(form.locator('input[name="incident.short_description"]')).toHaveValue(
      incident.shortDescription,
      { timeout: 60_000 },
    );

    console.log(`Incident created: ${createdNumber}`);
    test.info().annotations.push({ type: 'incident', description: createdNumber });
  });
});
