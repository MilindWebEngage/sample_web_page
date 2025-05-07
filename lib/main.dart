import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:webengage_flutter/webengage_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    await InAppWebViewController.setWebContentsDebuggingEnabled(kDebugMode);
  }
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const MyHomePage(title: 'Flutter Demo Home Page'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  WebEngagePlugin _webEngagePlugin = new WebEngagePlugin();
  InAppWebViewController? _webViewController;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Expanded(
              child: InAppWebView(
                initialUrlRequest: URLRequest(
                  url: WebUri("https://your-website.com"),
                ),
                onWebViewCreated: (InAppWebViewController controller) async {
                  _webViewController = controller;

                  controller.addJavaScriptHandler(
                      handlerName: 'webengage',
                      callback: (args) {
                        var methodName = args[0];
                        switch (methodName) {
                          case "Login":
                            var userID = args[1];
                            WebEngagePlugin.userLogin(userID);
                            break;
                          case "Logout":
                            WebEngagePlugin.userLogout();
                            break;
                          case "screen":
                            var screenName = args.length > 1 ? args[1] : null;
                            var screenData = args.length > 2 ? args[2] : null;
                            WebEngagePlugin.trackScreen(screenName, screenData);
                            break;
                          case "setAttribute":
                            var attribute = args.length > 1 ? args[1] : null;

                            WebEngagePlugin.setUserAttributes(attribute);
                            break;
                          case "trackEvent":
                            var eventName = args.length > 1 ? args[1] : null;
                            var eventData = args.length > 2 ? args[2] : null;
                            WebEngagePlugin.trackEvent(eventName, eventData);
                            break;
                        }
                      });
                },
              ),
            )
          ],
        ),
      ),
    );
  }
}
