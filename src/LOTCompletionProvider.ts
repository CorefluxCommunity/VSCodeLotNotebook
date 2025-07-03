import * as vscode from 'vscode';

export class LOTCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    // If the cell is completely empty, always provide DEFINE
    if (document.getText().trim() === '') {
      const defineItem = new vscode.CompletionItem('DEFINE', vscode.CompletionItemKind.Keyword);
      defineItem.detail = 'Start a new LOT definition';
      defineItem.documentation = new vscode.MarkdownString('Start a new LOT definition with DEFINE keyword');
      defineItem.insertText = new vscode.SnippetString('DEFINE ${1|MODEL,ACTION,ROUTE,RULE,VISU|} ${2:name}\n$0');
      defineItem.sortText = '0';
      defineItem.preselect = true;
      return [defineItem];
    }

    const linePrefix = document.lineAt(position).text.substr(0, position.character);
    const currentIndent = linePrefix.match(/^\s*/)?.[0] || '';
    const items: vscode.CompletionItem[] = [];

    // Helper function to create indented snippet
    const createIndentedSnippet = (snippet: string) => {
      const indent = currentIndent + '    '; // Add 4 spaces for each level
      return snippet.split('\n').map(line => indent + line).join('\n');
    };

    // Get the previous non-empty line
    const getPreviousLine = () => {
      let line = position.line - 1;
      while (line >= 0) {
        const text = document.lineAt(line).text.trim();
        if (text) return text;
        line--;
      }
      return '';
    };

    const previousLine = getPreviousLine();
    const isFirstLine = position.line === 0;
    const isIndented = currentIndent.length > 0;

    const prevLineText = previousLine.trim();
    const defineActionMatch = prevLineText.match(/^DEFINE\s+ACTION\s+[^"\s]+$/i);
    // If the previous non-empty line is DEFINE ACTION ... and the current line is empty, suggest ON
    if (defineActionMatch && linePrefix.trim() === '') {
      const onItem = new vscode.CompletionItem('ON', vscode.CompletionItemKind.Keyword);
      onItem.detail = 'Trigger on an event';
      onItem.documentation = new vscode.MarkdownString('Start an ON block for this action');
      onItem.insertText = new vscode.SnippetString('ON ');
      onItem.sortText = '0';
      onItem.preselect = true;
      return [onItem];
    }

    // If the current line prefix is 'ON ', suggest EVERY, TIME, TOPIC
    if (linePrefix.trim() === 'ON') {
      // User just typed 'ON' and is about to type a trigger type
      const everyItem = new vscode.CompletionItem('EVERY', vscode.CompletionItemKind.Keyword);
      everyItem.detail = 'Periodic trigger';
      everyItem.documentation = new vscode.MarkdownString('Trigger this action periodically');
      everyItem.insertText = new vscode.SnippetString('EVERY ${1:1} ${2|SECOND,SECONDS,MINUTE,MINUTES,HOUR,HOURS,DAY,DAYS,WEEK,WEEKS,MONTH,MONTHS,YEAR,YEARS|} DO\n\t$0');
      everyItem.sortText = '0';
      everyItem.preselect = true;
      items.push(everyItem);
      const timeItem = new vscode.CompletionItem('TIMESTAMP', vscode.CompletionItemKind.Keyword);
      timeItem.detail = 'Specific time trigger';
      timeItem.documentation = new vscode.MarkdownString('Trigger this action at a specific time. Format: dd-MM-yyyy HH:mm:ss');
      timeItem.insertText = new vscode.SnippetString('TIMESTAMP "${1:dd-MM-yyyy HH:mm:ss}" DO\n\t$0');
      timeItem.sortText = '1';
      items.push(timeItem);
      const topicItem = new vscode.CompletionItem('TOPIC', vscode.CompletionItemKind.Keyword);
      topicItem.detail = 'Topic-based trigger';
      topicItem.documentation = new vscode.MarkdownString('Trigger this action when a topic is published');
      topicItem.insertText = new vscode.SnippetString('TOPIC "${1:topic}" DO\n\t$0');
      topicItem.sortText = '2';
      items.push(topicItem);
      return items;
    }

    // General DEFINE suggestion at the start of a new block or first line
    if (isFirstLine || (!isIndented && linePrefix.trim() === '')) {
      const defineItem = new vscode.CompletionItem('DEFINE', vscode.CompletionItemKind.Keyword);
      defineItem.detail = 'Start a new LOT definition';
      defineItem.documentation = new vscode.MarkdownString('Start a new LOT definition with DEFINE keyword');
      defineItem.insertText = new vscode.SnippetString('DEFINE ${1|MODEL,ACTION,ROUTE,RULE,VISU|} ${2:name}\n$0');
      defineItem.sortText = '0';
      defineItem.preselect = true;
      items.push(defineItem);
      return items;
    }

    // After a line ending with DO, suggest action statements when properly indented (exactly 4 spaces or a tab)
    // Only trigger if explicitly requested (no space trigger)
    if ((linePrefix === '    ' || linePrefix === '\t') && prevLineText.endsWith('DO')) {
      // PUBLISH
      const publishItem = new vscode.CompletionItem('PUBLISH', vscode.CompletionItemKind.Keyword);
      publishItem.detail = 'Publish data to a topic';
      publishItem.documentation = new vscode.MarkdownString('Publish data to a specific topic');
      publishItem.insertText = new vscode.SnippetString('PUBLISH TOPIC "${1:topic}" WITH ${2:value}');
      publishItem.sortText = '0';
      publishItem.preselect = true;
      items.push(publishItem);
      // KEEP
      const keepItem = new vscode.CompletionItem('KEEP', vscode.CompletionItemKind.Keyword);
      keepItem.detail = 'Store data in a topic';
      keepItem.documentation = new vscode.MarkdownString('Store data in a specific topic');
      keepItem.insertText = new vscode.SnippetString('KEEP TOPIC "${1:topic}" WITH ${2:value}');
      keepItem.sortText = '1';
      items.push(keepItem);
      // IF
      const ifItem = new vscode.CompletionItem('IF', vscode.CompletionItemKind.Keyword);
      ifItem.detail = 'Conditional statement';
      ifItem.documentation = new vscode.MarkdownString('Execute code conditionally');
      ifItem.insertText = new vscode.SnippetString('IF ${1:condition} THEN\n\t${2:action}\nELSE\n\t${3:action}');
      ifItem.sortText = '2';
      items.push(ifItem);
      // GET
      const getItem = new vscode.CompletionItem('GET', vscode.CompletionItemKind.Keyword);
      getItem.detail = 'Get data from a topic';
      getItem.documentation = new vscode.MarkdownString('Retrieve data from a specific topic');
      getItem.insertText = new vscode.SnippetString('GET TOPIC "${1:topic}"');
      getItem.sortText = '3';
      items.push(getItem);
      // SET
      const setItem = new vscode.CompletionItem('SET', vscode.CompletionItemKind.Keyword);
      setItem.detail = 'Set a variable value';
      setItem.documentation = new vscode.MarkdownString('Set a variable to a specific value');
      setItem.insertText = new vscode.SnippetString('SET ${1:variable} WITH ${2:value}');
      setItem.sortText = '4';
      items.push(setItem);
      return items;
    }

    // After GET TOPIC "topic", suggest AS with type selector and math operators
    const getTopicMatch = linePrefix.match(/GET\s+TOPIC\s+"[^"]*"\s*$/i);
    if (getTopicMatch) {
      // AS with type selector
      const asItem = new vscode.CompletionItem('AS', vscode.CompletionItemKind.Keyword);
      asItem.detail = 'Specify data type';
      asItem.documentation = new vscode.MarkdownString('Specify the data type for the topic value');
      asItem.insertText = new vscode.SnippetString('AS ${1|DOUBLE,STRING,INT,BOOL,OBJECT,ARRAY,TIMESTAMP|}');
      asItem.sortText = '0';
      asItem.preselect = true;
      items.push(asItem);
      // Math operators
      const operators = ['+', '-', '*', '/'];
      operators.forEach((op, index) => {
        const opItem = new vscode.CompletionItem(op, vscode.CompletionItemKind.Operator);
        opItem.detail = 'Math operator';
        opItem.documentation = new vscode.MarkdownString(`Use ${op} for mathematical operation`);
        opItem.insertText = new vscode.SnippetString(`${op} $0`);
        opItem.sortText = String.fromCharCode(97 + index); // a, b, c, d
        items.push(opItem);
      });
      return items;
    }

    // After math operators, suggest variables and GET
    const mathOpMatch = linePrefix.match(/.*[\+\-\*\/]\s*$/);
    if (mathOpMatch) {
      // Variable placeholder
      const varItem = new vscode.CompletionItem('{variable}', vscode.CompletionItemKind.Variable);
      varItem.detail = 'Variable reference';
      varItem.documentation = new vscode.MarkdownString('Reference a variable in the expression');
      varItem.insertText = new vscode.SnippetString('{${1:variable}}');
      varItem.sortText = '0';
      varItem.preselect = true;
      items.push(varItem);
      // GET
      const getItem = new vscode.CompletionItem('GET', vscode.CompletionItemKind.Keyword);
      getItem.detail = 'Get data from topic';
      getItem.documentation = new vscode.MarkdownString('Get data from another topic');
      getItem.insertText = new vscode.SnippetString('GET TOPIC "${1:topic}"');
      getItem.sortText = '1';
      items.push(getItem);
      return items;
    }

    // If we have a complete definition line, suggest the next steps based on entity type
    const fullMatch = previousLine.match(/DEFINE\s+(MODEL|ACTION|RULE|ROUTE|VISU)\s+"?([^"\s]+)"?(?:\s+COLLAPSED)?(?:\s+WITH\s+TYPE\s+([^\s]+))?/i);
    if (fullMatch && !isIndented) {
      const entityType = fullMatch[1].toUpperCase();
      const isCollapsed = previousLine.includes('COLLAPSED');
      const routeType = fullMatch[3];

      // Only suggest ON for ACTION if not already present
      if (entityType === 'ACTION' && prevLineText !== 'ON') {
        const onItem = new vscode.CompletionItem('ON', vscode.CompletionItemKind.Keyword);
        onItem.detail = 'Trigger on an event';
        onItem.documentation = new vscode.MarkdownString('Start an ON block for this action');
        onItem.insertText = new vscode.SnippetString('ON');
        onItem.sortText = '0';
        onItem.preselect = true;
        items.push(onItem);
        return items;
      }

      // Type-specific first-level keywords (for other entity types)
      const firstLevelKeywords: { [key: string]: Array<{ keyword: string; icon: string; description: string; snippet: string }> } = {
        'MODEL': [
          { keyword: 'ADD', icon: '$(add)', description: 'Add a property to the model', snippet: 'ADD ${1:type} "${2:name}" WITH ${3:value}' },
          { keyword: 'COLLAPSED', icon: '$(collapse-all)', description: 'Collapse multiple values', snippet: 'COLLAPSED WITH ${1:value}' }
        ],
        'ROUTE': [
          { keyword: 'ADD', icon: '$(add)', description: 'Add a configuration or mapping', snippet: 'ADD ${1:config_type}\n\t$0' }
        ],
        'RULE': [
          { keyword: 'WHEN', icon: '$(symbol-event)', description: 'Define rule trigger conditions', snippet: 'WHEN ${1:condition}' }
        ],
        'VISU': [
          { keyword: 'DISPLAY', icon: '$(eye)', description: 'Define display properties', snippet: 'DISPLAY\n\t$0' }
        ]
      };

      const keywords = firstLevelKeywords[entityType] || [];
      keywords.forEach(({ keyword, icon, description, snippet }) => {
        const item = new vscode.CompletionItem(`${icon} ${keyword}`, vscode.CompletionItemKind.Keyword);
        item.detail = `${entityType}-specific keyword`;
        item.documentation = new vscode.MarkdownString(description);
        item.insertText = new vscode.SnippetString(snippet);
        item.sortText = keyword;
        item.preselect = true;
        items.push(item);
      });

      return items;
    }

    // Handle indented lines based on the previous line's context
    if (isIndented) {
      // If previous line ends with DO, suggest indented actions
      if (previousLine.endsWith('DO')) {
        const indentedKeywords = [
          { keyword: 'IF', icon: '$(symbol-operator)', description: 'Conditional statement', snippet: 'IF ${1:condition} THEN\n\t$2\nELSE\n\t$0' },
          { keyword: 'PUBLISH', icon: '$(arrow-up)', description: 'Publish data to a topic', snippet: 'PUBLISH TOPIC "${1:topic}" WITH ${2:value}' },
          { keyword: 'SET', icon: '$(edit)', description: 'Set a value', snippet: 'SET ${1:variable} WITH ${2:value}' }
        ];

        indentedKeywords.forEach(({ keyword, icon, description, snippet }) => {
          const item = new vscode.CompletionItem(`${icon} ${keyword}`, vscode.CompletionItemKind.Keyword);
          item.detail = 'Action keyword';
          item.documentation = new vscode.MarkdownString(description);
          item.insertText = new vscode.SnippetString(createIndentedSnippet(snippet));
          item.sortText = keyword;
          items.push(item);
        });
      }
      // If previous line starts with IF, suggest THEN
      else if (previousLine.trim().startsWith('IF')) {
        const thenItem = new vscode.CompletionItem('$(arrow-right) THEN', vscode.CompletionItemKind.Keyword);
        thenItem.detail = 'Then clause';
        thenItem.documentation = new vscode.MarkdownString('Define the action to take when condition is true');
        thenItem.insertText = new vscode.SnippetString(createIndentedSnippet('THEN\n\t$0'));
        thenItem.sortText = 'THEN';
        thenItem.preselect = true;
        items.push(thenItem);
      }
      // If previous line starts with THEN, suggest ELSE
      else if (previousLine.trim().startsWith('THEN')) {
        const elseItem = new vscode.CompletionItem('$(arrow-both) ELSE', vscode.CompletionItemKind.Keyword);
        elseItem.detail = 'Else clause';
        elseItem.documentation = new vscode.MarkdownString('Define the action to take when condition is false');
        elseItem.insertText = new vscode.SnippetString(createIndentedSnippet('ELSE\n\t$0'));
        elseItem.sortText = 'ELSE';
        elseItem.preselect = true;
        items.push(elseItem);
      }
      // If previous line starts with ADD, suggest WITH
      else if (previousLine.trim().startsWith('ADD')) {
        const withItem = new vscode.CompletionItem('$(symbol-operator) WITH', vscode.CompletionItemKind.Keyword);
        withItem.detail = 'Assign a value';
        withItem.documentation = new vscode.MarkdownString('Assign a value or expression');
        withItem.insertText = new vscode.SnippetString(createIndentedSnippet('WITH ${1:value}'));
        withItem.sortText = 'WITH';
        withItem.preselect = true;
        items.push(withItem);
      }
    }

    return items;
  }
} 