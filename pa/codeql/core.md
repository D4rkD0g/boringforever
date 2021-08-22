version: codeqlcli 2.5.9
env: macOS

codeql为bash脚本，最后

```bash
exec "${CODEQL_JAVA_HOME}/bin/java" \
    $jvmArgs \
    --add-modules jdk.unsupported \
    -cp "$CODEQL_DIST/tools/codeql.jar" \
    "com.semmle.cli2.CodeQL" "$@"
```

直接jd-gui得到源码，加载进IDEA，然后run->Edit Configurations->new->Remote JVM Debug。下断点。

终端执行
`java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005 --add-modules jdk.unsupported -cp tools/codeql.jar "com.semmle.cli2.CodeQL" "--version"`

然后IDEA调试，即可停在断点处

入口com.semmle.cli2.CodeQL，但runMain在cli2.picocli.SubcommandMaker中

## 0x01 构建数据库  

`java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005 --add-modules jdk.unsupported -cp ../tools/codeql.jar "com.semmle.cli2.CodeQL" database create testc --language=cpp '--command=gcc x.c'`

通过执行不同的类

```java
com.semmel.cli2.database.CreateCommand

executeHelpRequest@picocli/CommandLine.java -> return ((Integer)executeSubcommand.apply(subcommand)).intValue();@SubcommandMaker.java -> 

protected void executeSubcommand() throws SubcommandDone {
	this.initOptions.setupLogging(this, false, this.initOptions.overwrite());
	printProgress("Initializing {} at {}.", new Object[] { this.initOptions.what(), this.initOptions.directory });
	int result = runPlumbingInProcess(InitCommand.class, new Object[] { this.initOptions, "--source-root=" + this.sourceRoot, "--allow-missing-source-root=" + this.traceCommandOptions
		.hasWorkingDir(), "--allow-already-existing", "--", this.initOptions.directory });

@database/CreateCommand.java

toRun class com.semmle.cli2.database.InitCommand

```

initOneDatabase@InitCommand.java  

第一步 找对应的extractor 

class com.semmle.cli2.resolve.ResolveLanguagesCommand => 

{
  "cpp" : [
    "/Users/lambda/codeql/codeqlcli/cpp"
  ],
  "csharp" : [
    "/Users/lambda/codeql/codeqlcli/csharp"
  ],
  "csv" : [
    "/Users/lambda/codeql/codeqlcli/csv"
  ],
  "go" : [
    "/Users/lambda/codeql/codeqlcli/go"
  ],
  "html" : [
    "/Users/lambda/codeql/codeqlcli/html"
  ],
  "java" : [
    "/Users/lambda/codeql/codeqlcli/java"
  ],
  "javascript" : [
    "/Users/lambda/codeql/codeqlcli/javascript"
  ],
  "properties" : [
    "/Users/lambda/codeql/codeqlcli/properties"
  ],
  "python" : [
    "/Users/lambda/codeql/codeqlcli/python"
  ],
  "xml" : [
    "/Users/lambda/codeql/codeqlcli/xml"
  ]
}

第二步 构建CodeQLExtractor extractor = new CodeQLExtractor(packRoot);

```java
/*     */ public class CodeQLExtractor
/*     */ {
/*     */   public static final String TRACING_SPEC_FILENAME = "compiler-tracing.spec";
/*     */   private final Logger logger;
/*     */   private final Path extractorRoot;
/*     */   private final String name;
/*     */   private final String displayName;
/*     */   private final String version;
/*     */   private final boolean unicodeNewlines;
/*     */   private final ColumnKind columnKind;
/*     */   private final boolean legacyTestExtraction;
/*     */   private final Map<String, String> extraEnvVars;
```

解析codeql-extractor.yml 

```java
private DbInfo() {
	this.unicodeNewlines = Boolean.valueOf(false);
	this.columnKind = ColumnKind.UTF_16_CODE_UNITS; } public DbInfo(String sourceLocationPrefix, boolean unicodeNewlines, ColumnKind columnKind, String primaryLanguage, Map<String, List<Path>> installedExtractors) { this.unicodeNewlines = Boolean.valueOf(false); this.columnKind = ColumnKind.UTF_16_CODE_UNITS;
		this.sourceLocationPrefix = sourceLocationPrefix;
		this.unicodeNewlines = Boolean.valueOf(unicodeNewlines);
		this.columnKind = columnKind;
		this.primaryLanguage = primaryLanguage;
		if (primaryLanguage != null || installedExtractors != null) {
			this.inProgress = new InProgress(primaryLanguage, installedExtractors);
		} 
	}
```

第三步 创建

```java
DatabaseLayout layout = DatabaseLayout.create(databaseDir, dbInfo);

result = p.execute(); /Users/lambda/codeql/codeqlcli/tools/osx64/preload_tracer gcc x.c
```

emmm，感觉到头来还是preload_tracer和extractor这两个二进制，但是extractor是不是可以参考go的开源https://github.com/github/codeql-go

## 0x02 查询数据库  

`java -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005 --add-modules jdk.unsupported -cp ../tools/codeql.jar "com.semmle.cli2.CodeQL" database run-queries testc /Users/lambda/codeql/codeql-repo/cpp/ql/src/func.ql`

class com.semmle.cli2.execute.ExecuteQueriesCommand

## 0x03 其中的Tensorflow

看到了词嵌入，以及加载`.qlmodel`的模型文件，但是工具中显然并没有


