[![build status](https://secure.travis-ci.org/gregrperkins/soyset.png)](http://travis-ci.org/gregrperkins/soyset)

# soyset

A wrapper for the java compiler ([SoyToJsSrcCompiler.jar][jar]),
in order to use soy ([closure templates][docs]) in node projects.

Similar to [soynode][soynode] but with a different
interface. In fact, the soynode npm package is the jar delivery mechanism.

Essentially you want to extend `SoySet` and override
the `SoySet#_getSoyRoots` function. (Possibly `SoySet#_options` as well.)

While there are tests, it's not really the most mature thing in the world, yet.

 [soynode]: https://github.com/Obvious/soynode
 [jar]: https://code.google.com/p/closure-templates/downloads/list
 [docs]: https://developers.google.com/closure/templates/docs/overview
